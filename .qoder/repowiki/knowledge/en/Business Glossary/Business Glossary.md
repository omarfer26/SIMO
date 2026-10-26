---
kind: business_term
name: Business Glossary
category: business_term
scope:
    - '**'
---

### Kardex
- Definition：The perpetual inventory ledger maintained by the system; every stock movement (purchase entry, sale, transfer) writes a row so that balances can be audited. It is treated as immutable by the application layer — the `simo_app` role cannot modify it, and restoration scripts validate it with `fn_validar_kardex()`.
- Aliases：kardex

### Bodega
- Definition：The warehouse stock location. Purchase receipts increase stock here first; sales draw from it. It is distinguished from `almacen` (store/front-stock), which remains zero in the seed data.
- Aliases：bodega

### Almacén
- Definition：The store/front-stock location, separate from Bodega. In the current schema both locations exist but the seed leaves almacén at zero; transfers between Bodega and Almacén are modeled by the `FormularioTraslado` component.
- Aliases：almacen

### Rotación de stock
- Definition：Dashboard metric defined as units sold divided by estimated average inventory, where average inventory is approximated as current stock plus half of units sold (the system only stores today's stock snapshot, not a time series). Thresholds classify rotation as Alta ≥ 0.75×, Media ≥ 0.30×, Baja < 0.30×.
- Aliases：rotación de stock、rotación

### Medios de pago
- Definition：Payment-method breakdown shown as a donut chart in the operational dashboard, expressing each method's share of total revenue for the selected period, with the total collected amount displayed at the center.
- Aliases：medios de pago

### Ingreso a Bodega
- Definition：Purchase receipt operation that adds stock exclusively to Bodega and records a Kardex movement atomically. It is exposed via `POST /api/inventory/entries` and supports optional supplier, cost, document reference, and observation fields.
- Aliases：ingreso bodega、entrada bodega

### Compra a proveedor
- Definition：Multi-line purchase order submitted via `POST /api/inventory/purchases`. By default it auto-confirms (all lines move into Bodega through `sp_confirmar_compra`); setting `confirmar: false` keeps it in BORRADER state without touching stock. Confirmed purchases are immutable at the database level.
- Aliases：compra、orden de compra

### SCRUM-*
- Definition：Internal ticket identifiers (e.g. SCRUM-22, SCRUM-94, SCRUM-134) used throughout the README and deployment docs to cross-reference requirements, features, and non-functional rules such as RNF-05. They are the primary traceability key between business requirements and implementation.
- Aliases：scrum ticket、SCRUM
