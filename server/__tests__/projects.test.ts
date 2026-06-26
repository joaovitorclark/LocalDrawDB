/**
 * Testes TDD para a camada multi-projeto (F0).
 * Usa LOCALDRAWDB_DATA_DIR apontando para um diretório temporário
 * para não tocar em data/ real.
 * Usa vi.resetModules() + import() para recarregar files.ts com o env var correto.
 */
import { promises as fs } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import type * as FilesModule from '../files.ts';

// ──────────────────────────────────────────────────────────────
// Helpers de setup: cada teste recebe um tmpdir limpo.
// ──────────────────────────────────────────────────────────────
let tmpDir: string;

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'localdrawdb-test-'));
  process.env.LOCALDRAWDB_DATA_DIR = tmpDir;
  vi.resetModules();
});

afterEach(async () => {
  delete process.env.LOCALDRAWDB_DATA_DIR;
  vi.resetModules();
  await fs.rm(tmpDir, { recursive: true, force: true });
});

async function importFiles(): Promise<typeof FilesModule> {
  return import('../files.ts');
}

// ──────────────────────────────────────────────────────────────
// 1. Migração a partir de instalação legada
// ──────────────────────────────────────────────────────────────
describe('migrateLegacy — instalação legada', () => {
  it('cria projects/default com conteúdo migrado de project.dbml e input/', async () => {
    // Prepara estrutura legada
    await fs.mkdir(path.join(tmpDir, 'input'), { recursive: true });
    await fs.writeFile(path.join(tmpDir, 'project.dbml'), 'Table t1 { id int }', 'utf8');
    await fs.writeFile(path.join(tmpDir, 'canvas.json'), '{"nodes":[]}', 'utf8');
    await fs.writeFile(path.join(tmpDir, 'input', 'schema.sql'), '-- sql', 'utf8');

    const { migrateLegacy, loadProject, projectInputDir, listProjects } = await importFiles();

    await migrateLegacy();

    // DBML foi migrado
    const { dbml } = await loadProject();
    expect(dbml).toBe('Table t1 { id int }');

    // Input foi migrado
    const defaultSlug = (await listProjects())[0].slug;
    const inputDir = projectInputDir(defaultSlug);
    const files = await fs.readdir(inputDir);
    expect(files).toContain('schema.sql');

    // projects.json foi criado
    const reg = JSON.parse(
      await fs.readFile(path.join(tmpDir, 'projects.json'), 'utf8'),
    );
    expect(reg.projects).toHaveLength(1);
    expect(reg.activeId).toBeTruthy();
  });

  it('é idempotente: segunda chamada não altera o estado', async () => {
    await fs.writeFile(path.join(tmpDir, 'project.dbml'), 'Table a { id int }', 'utf8');

    const { migrateLegacy, listProjects } = await importFiles();

    await migrateLegacy();
    await migrateLegacy(); // segunda chamada

    const projects = await listProjects();
    expect(projects).toHaveLength(1); // ainda apenas um projeto
  });
});

// ──────────────────────────────────────────────────────────────
// 2. Instalação limpa (sem legado)
// ──────────────────────────────────────────────────────────────
describe('migrateLegacy — instalação limpa', () => {
  it('cria projects/default vazio e o registra como ativo', async () => {
    const { migrateLegacy, listProjects, getActiveId } = await importFiles();

    await migrateLegacy();

    const projects = await listProjects();
    expect(projects).toHaveLength(1);
    expect(projects[0].name).toBe('default');

    const activeId = await getActiveId();
    expect(activeId).toBe(projects[0].id);
  });
});

// ──────────────────────────────────────────────────────────────
// 2b. ensureRegistry — registry ausente
// ──────────────────────────────────────────────────────────────
describe('ensureRegistry — projects.json ausente', () => {
  it('reconstrói o registry a partir das pastas em projects/ quando o arquivo foi apagado', async () => {
    // Projetos existem no disco, mas projects.json foi apagado.
    await fs.mkdir(path.join(tmpDir, 'projects', 'vendas'), { recursive: true });
    await fs.mkdir(path.join(tmpDir, 'projects', 'rh'), { recursive: true });

    const { ensureRegistry, listProjects } = await importFiles();
    await ensureRegistry();

    const projects = await listProjects();
    expect(projects.map((p) => p.slug).sort()).toEqual(['rh', 'vendas']);

    // projects.json foi recriado e o activeId aponta para um projeto existente.
    const reg = JSON.parse(await fs.readFile(path.join(tmpDir, 'projects.json'), 'utf8'));
    expect(reg.activeId).toBeTruthy();
    expect(reg.projects.some((p: { id: string }) => p.id === reg.activeId)).toBe(true);
  });

  it('numa instalação limpa cria o projeto default', async () => {
    const { ensureRegistry, listProjects } = await importFiles();
    await ensureRegistry();

    const projects = await listProjects();
    expect(projects).toHaveLength(1);
    expect(projects[0].slug).toBe('default');
  });

  it('não sobrescreve um registry já existente', async () => {
    const { migrateLegacy, createProject, ensureRegistry, listProjects } = await importFiles();
    await migrateLegacy();
    await createProject('Outro');

    const before = await listProjects();
    await ensureRegistry();
    const after = await listProjects();

    expect(after.map((p) => p.id).sort()).toEqual(before.map((p) => p.id).sort());
  });
});

// ──────────────────────────────────────────────────────────────
// 3. CRUD de projetos
// ──────────────────────────────────────────────────────────────
describe('createProject / listProjects', () => {
  it('cria projeto com slug único e retorna metadados', async () => {
    const { migrateLegacy, createProject, listProjects } = await importFiles();
    await migrateLegacy();

    const meta = await createProject('Meu Projeto');
    expect(meta.name).toBe('Meu Projeto');
    expect(meta.slug).toBe('meu-projeto');
    expect(meta.id).toBeTruthy();
    expect(meta.createdAt).toBeTruthy();

    const all = await listProjects();
    expect(all.map((p) => p.id)).toContain(meta.id);
  });

  it('gera slug sem conflito adicionando sufixo numérico', async () => {
    const { migrateLegacy, createProject } = await importFiles();
    await migrateLegacy();

    const p1 = await createProject('Alpha');
    const p2 = await createProject('Alpha');
    expect(p1.slug).toBe('alpha');
    expect(p2.slug).toBe('alpha-2');
  });
});

describe('renameProject', () => {
  it('atualiza o nome mas mantém o slug', async () => {
    const { migrateLegacy, createProject, renameProject, listProjects } = await importFiles();
    await migrateLegacy();

    const meta = await createProject('Projeto Original');
    await renameProject(meta.id, 'Novo Nome');

    const all = await listProjects();
    const found = all.find((p) => p.id === meta.id)!;
    expect(found.name).toBe('Novo Nome');
    expect(found.slug).toBe(meta.slug); // slug estável
  });
});

describe('deleteProject', () => {
  it('remove diretório e entrada do registro', async () => {
    const { migrateLegacy, createProject, deleteProject, listProjects } = await importFiles();
    await migrateLegacy();

    const p = await createProject('Temporário');
    await deleteProject(p.id);

    const all = await listProjects();
    expect(all.map((x) => x.id)).not.toContain(p.id);

    // Diretório foi removido
    const dirExists = await fs
      .stat(path.join(tmpDir, 'projects', p.slug))
      .then(() => true)
      .catch(() => false);
    expect(dirExists).toBe(false);
  });

  it('não permite deletar o último projeto', async () => {
    const { migrateLegacy, listProjects, deleteProject } = await importFiles();
    await migrateLegacy();

    const [last] = await listProjects();
    await expect(deleteProject(last.id)).rejects.toThrow();
  });

  it('reatribui activeId ao deletar o projeto ativo', async () => {
    const { migrateLegacy, createProject, deleteProject, setActiveProject, getActiveId } =
      await importFiles();
    await migrateLegacy();

    const p2 = await createProject('Segundo');
    await setActiveProject(p2.id);
    await deleteProject(p2.id);

    const activeId = await getActiveId();
    expect(activeId).toBeTruthy();
    expect(activeId).not.toBe(p2.id);
  });
});

describe('duplicateProject', () => {
  it('copia dbml e canvas para novo projeto com slug próprio', async () => {
    const {
      migrateLegacy,
      createProject,
      saveProjectBySlug,
      loadProjectBySlug,
      duplicateProject,
      listProjects,
    } = await importFiles();
    await migrateLegacy();

    const original = await createProject('Original');
    await saveProjectBySlug(original.slug, 'Table X { id int }', { nodes: ['x'] });

    const copy = await duplicateProject(original.id);
    const { dbml, canvas } = await loadProjectBySlug(copy.slug);
    expect(dbml).toBe('Table X { id int }');
    expect(canvas).toMatchObject({ nodes: ['x'] });

    // Slug diferente
    expect(copy.slug).not.toBe(original.slug);

    // Aparece na lista
    const all = await listProjects();
    expect(all.map((p) => p.id)).toContain(copy.id);
  });

  it('copia arquivos da pasta input/', async () => {
    const { migrateLegacy, createProject, projectInputDir, duplicateProject } = await importFiles();
    await migrateLegacy();

    const original = await createProject('WithInput');
    const inputDir = projectInputDir(original.slug);
    await fs.mkdir(inputDir, { recursive: true });
    await fs.writeFile(path.join(inputDir, 'demo.sql'), '-- demo', 'utf8');

    const copy = await duplicateProject(original.id);
    const copyInput = projectInputDir(copy.slug);
    const files = await fs.readdir(copyInput);
    expect(files).toContain('demo.sql');
  });
});

// ──────────────────────────────────────────────────────────────
// 4. setActiveProject / getActiveId
// ──────────────────────────────────────────────────────────────
describe('setActiveProject / getActiveId', () => {
  it('altera o projeto ativo e persiste no registry', async () => {
    const { migrateLegacy, createProject, setActiveProject, getActiveId } = await importFiles();
    await migrateLegacy();

    const p2 = await createProject('Segundo');
    await setActiveProject(p2.id);

    const activeId = await getActiveId();
    expect(activeId).toBe(p2.id);
  });

  it('rejeita ID inexistente', async () => {
    const { migrateLegacy, setActiveProject } = await importFiles();
    await migrateLegacy();

    await expect(setActiveProject('id-que-nao-existe')).rejects.toThrow();
  });
});

// ──────────────────────────────────────────────────────────────
// 5. Wrappers de compatibilidade (rotas existentes)
// ──────────────────────────────────────────────────────────────
describe('wrappers de compatibilidade — loadProject / saveProject', () => {
  it('lê e grava no projeto ativo', async () => {
    const { migrateLegacy, createProject, setActiveProject, loadProject, saveProject } =
      await importFiles();
    await migrateLegacy();

    const p2 = await createProject('Ativo');
    await setActiveProject(p2.id);

    await saveProject('Table Z { id int }', { zoom: 1 });
    const { dbml, canvas } = await loadProject();
    expect(dbml).toBe('Table Z { id int }');
    expect(canvas).toMatchObject({ zoom: 1 });
  });
});

describe('wrapper readInputSql', () => {
  it('lê SQL do projeto ativo', async () => {
    const { migrateLegacy, createProject, setActiveProject, readInputSql, projectInputDir } =
      await importFiles();
    await migrateLegacy();

    const p = await createProject('ComSQL');
    await setActiveProject(p.id);
    const inDir = projectInputDir(p.slug);
    await fs.mkdir(inDir, { recursive: true });
    await fs.writeFile(path.join(inDir, 'test.sql'), 'SELECT 1', 'utf8');

    const results = await readInputSql();
    expect(results.some((r) => r.file === 'test.sql')).toBe(true);
  });
});

describe('wrapper writeOutput', () => {
  it('escreve no output do projeto ativo', async () => {
    const { migrateLegacy, createProject, setActiveProject, writeOutput, projectOutputDir } =
      await importFiles();
    await migrateLegacy();

    const p = await createProject('ExportTest');
    await setActiveProject(p.id);

    const relPath = await writeOutput('diagram.png', 'fake-png');
    // Arquivo deve estar dentro do output do projeto
    const outDir = projectOutputDir(p.slug);
    const fileExists = await fs
      .stat(path.join(outDir, 'diagram.png'))
      .then(() => true)
      .catch(() => false);
    expect(fileExists).toBe(true);
    // Caminho retornado é relativo (não absoluto)
    expect(path.isAbsolute(relPath)).toBe(false);
  });
});

// ──────────────────────────────────────────────────────────────
// 6. syncRegistryWithDisk — pastas criadas na mão
// ──────────────────────────────────────────────────────────────
describe('syncRegistryWithDisk — pastas criadas na mão', () => {
  it('adiciona ao registry pastas novas em projects/ (registry presente)', async () => {
    const { migrateLegacy, syncRegistryWithDisk, listProjects } = await importFiles();
    await migrateLegacy(); // cria default + projects.json
    await fs.mkdir(path.join(tmpDir, 'projects', 'vendas'), { recursive: true });

    const added = await syncRegistryWithDisk();
    expect(added).toEqual(['vendas']);

    const slugs = (await listProjects()).map((p) => p.slug).sort();
    expect(slugs).toEqual(['default', 'vendas']);
  });

  it('é idempotente quando nada novo no disco', async () => {
    const { migrateLegacy, syncRegistryWithDisk } = await importFiles();
    await migrateLegacy();
    expect(await syncRegistryWithDisk()).toEqual([]);
  });

  it('ensureRegistry com registry presente também faz o sync', async () => {
    const { migrateLegacy, ensureRegistry, listProjects } = await importFiles();
    await migrateLegacy();
    await fs.mkdir(path.join(tmpDir, 'projects', 'rh'), { recursive: true });

    await ensureRegistry();

    const slugs = (await listProjects()).map((p) => p.slug).sort();
    expect(slugs).toEqual(['default', 'rh']);
  });
});
