# Pending, unapplied migrations

SQL here is reviewed in Git but deliberately NOT applied to production by the
agent. Apply through the controlled migration process when authorized.

- `20260816140000_pr27_tax_intake_company_fields.sql` — PR27: adds optional
  `taxpayer_kpp` and `taxpayer_legal_address` fields to the
  `tax_audit_objections_extended` intake schema (idempotent).
