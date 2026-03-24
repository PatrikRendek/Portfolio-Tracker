from django.db import migrations
import os


def update_site(apps, schema_editor):
    Site = apps.get_model("sites", "Site")
    # Get the domain from Render env or fallback
    domain = os.getenv("RENDER_EXTERNAL_HOSTNAME")

    if domain:
        # Update or create the default site (ID=1)
        Site.objects.update_or_create(
            id=1, defaults={"domain": domain, "name": "StockPulse"}
        )


class Migration(migrations.Migration):
    dependencies = [
        ("stocks", "0004_transaction"),
        (
            "sites",
            "0002_alter_domain_unique",
        ),  # Dependency on django.contrib.sites migration
    ]

    operations = [
        migrations.RunPython(update_site),
    ]
