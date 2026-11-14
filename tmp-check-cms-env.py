from pathlib import Path
cms = Path("/var/www/oonni-cms/.env").read_text(errors="replace").splitlines()
portal = Path("/var/www/on-boarding-manufacturer-portal-oonni/.env").read_text(errors="replace").splitlines()

def val(lines, key):
    for line in lines:
        if line.startswith(key + "="):
            return line.split("=", 1)[1].strip().strip('"').strip("'")
    return None

cms_token = val(cms, "PORTAL_CMS_TOKEN")
cms_alt = val(cms, "CMS_PORTAL_TOKEN")
portal_token = val(portal, "CMS_PORTAL_TOKEN")
portal_alt = val(portal, "PORTAL_CMS_TOKEN")
print("cms_PORTAL_CMS_TOKEN", "missing" if cms_token is None else f"len={len(cms_token)}")
print("cms_CMS_PORTAL_TOKEN", "missing" if cms_alt is None else f"len={len(cms_alt)}")
print("portal_CMS_PORTAL_TOKEN", "missing" if portal_token is None else f"len={len(portal_token)}")
print("portal_PORTAL_CMS_TOKEN", "missing" if portal_alt is None else f"len={len(portal_alt)}")
print("tokens_match", bool(cms_token) and cms_token == portal_token)