// Parser puro das flags do `npm run dev` multimodo. Sem efeitos colaterais.
export function parseDevArgs(argv) {
  let mode = 'shared';
  const slugs = [];
  let preview = false;
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--all') {
      if (mode === 'project') throw new Error('Use --all OU --project(s), não ambos.');
      mode = 'all';
    } else if (a === '--project' || a === '--projects') {
      if (mode === 'all') throw new Error('Use --all OU --project(s), não ambos.');
      const val = argv[++i];
      if (!val || val.startsWith('--')) throw new Error(`${a} exige um slug (ex.: ${a} vendas).`);
      for (const s of val.split(',').map((x) => x.trim()).filter(Boolean)) slugs.push(s);
      mode = 'project';
    } else if (a === '--preview') {
      preview = true;
    } else {
      throw new Error(`Flag desconhecida: ${a}`);
    }
  }
  if (mode === 'project' && slugs.length === 0) throw new Error('--project(s) exige ao menos um slug.');
  return { mode, slugs: mode === 'project' ? slugs : null, preview };
}

export function resolveSlugs(parsed, registry) {
  const available = registry.projects.map((p) => p.slug);
  if (parsed.mode === 'shared') return null;
  if (parsed.mode === 'all') {
    if (available.length === 0) throw new Error('Nenhum projeto no registry.');
    return available;
  }
  const missing = parsed.slugs.filter((s) => !available.includes(s));
  if (missing.length) {
    throw new Error(
      `Slug(s) inexistente(s): ${missing.join(', ')}. Disponíveis: ${available.join(', ') || '(nenhum)'}`,
    );
  }
  return parsed.slugs;
}
