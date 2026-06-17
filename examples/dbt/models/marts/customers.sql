{{ config(materialized='table', tags=['core']) }}

-- Exemplo genérico: dimensão de clientes a partir da fonte crua.
with raw_customers as (
    select * from {{ source('raw', 'raw_customers') }}
)

select
    id,
    name
from raw_customers
