-- Keep historical sessions resolvable while removing the confusing
-- "additional control objections" card from the active template catalog.
UPDATE public.legal_document_templates
SET
  is_active = false,
  metadata = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object(
    'deprecated', true,
    'replacement_code', 'tax_audit_objections_extended',
    'deprecated_reason', 'Removed from active catalog: use the reviewed expanded audit objections card'
  )
WHERE code = 'tax_additional_control_objections';

-- Make the reviewed scope of the expanded card explicit for the package router.
UPDATE public.legal_document_templates
SET
  is_active = true,
  metadata = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object(
    'template_variant', 'expanded_audit_objections',
    'package_router_scope', 'tax_audit_act',
    'reviewed', true
  )
WHERE code = 'tax_audit_objections_extended';
