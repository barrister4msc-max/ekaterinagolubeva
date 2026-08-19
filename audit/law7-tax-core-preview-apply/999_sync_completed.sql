begin; update law7_mirror.sync_state set status='completed',codes_count=8,article_versions_count=2866,amendments_count=0,completed_at=now(),updated_at=now() where dataset_key='law7_codes'; commit;
