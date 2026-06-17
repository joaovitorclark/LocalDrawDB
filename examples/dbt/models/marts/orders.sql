{{ config(materialized='incremental', tags=['sales', 'core']) }}

-- Exemplo genérico: junta pedidos crus com clientes.
with raw_orders as (
    select * from {{ source('raw', 'raw_orders') }}
),
customers as (
    select * from {{ ref('customers') }}
)

select
    id,
    customer_id,
    status
from raw_orders
