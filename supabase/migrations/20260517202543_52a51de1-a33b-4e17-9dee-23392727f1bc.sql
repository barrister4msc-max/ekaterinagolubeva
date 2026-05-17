-- Lock down SECURITY DEFINER functions (still callable from policies/triggers)
revoke execute on function public.has_role(uuid, public.app_role) from public, anon, authenticated;
revoke execute on function public.handle_new_user() from public, anon, authenticated;
revoke execute on function public.update_updated_at_column() from public, anon, authenticated;

-- Replace broad listing policy with admin-only listing.
-- Public direct URLs still work (public bucket bypasses RLS for CDN reads).
drop policy if exists "Hero images publicly readable" on storage.objects;

create policy "Admins can list hero images"
on storage.objects for select
to authenticated
using (bucket_id = 'hero' and public.has_role(auth.uid(), 'admin'));