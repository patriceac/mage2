"""Package the current, honestly labelled checkpoint. No media generation or app launch."""
from pathlib import Path
import hashlib
import json
import shutil
import zipfile
import datetime

root = Path(__file__).resolve().parents[1]
out = root / "output/the-last-kindness"
stamp = datetime.datetime.now(datetime.timezone.utc).strftime("%Y%m%dT%H%M%SZ")
stage = out / ("checkpoint-" + stamp)
stage.mkdir()
project = out / "editable-project"
editable = stage / "editable-project"
editable.mkdir()
for name in ["project", "assets", "locations", "scenes", "dialogues", "inventory", "strings"]:
    shutil.copy2(project / (name + ".json"), editable)
shutil.copytree(project / "media", editable / "media")
shutil.copytree(project / "build", stage / "official-web-export")
shutil.copytree(root / "games/the-last-kindness", stage / "sources/games/the-last-kindness")
shutil.copytree(root / "games/the-last-kindness/production", stage / "production")
shutil.copy2(root / "games/the-last-kindness/production/DELIVERY.md", stage / "DELIVERY.md")
script_dest = stage / "sources/scripts"
script_dest.mkdir(parents=True)
for name in ["last-kindness.test.ts", "last-kindness-export.test.ts", "verify-last-kindness-hyperv.ps1", "package-last-kindness.py"]:
    shutil.copy2(root / "scripts" / name, script_dest)
(script_dest / "verification").mkdir()
for name in ["last-kindness-guest.mjs", "last-kindness-web-repair.js"]:
    shutil.copy2(root / "scripts/verification" / name, script_dest / "verification")
shutil.copytree(out / "evidence", stage / "evidence")

def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()

files = sorted(p for p in stage.rglob("*") if p.is_file())
manifest = {p.relative_to(stage).as_posix(): {"sha256": sha(p), "bytes": p.stat().st_size} for p in files}
(stage / "FILES.sha256.json").write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")
archive = out / ("The-Last-Kindness-Saint-Orme-checkpoint-" + stamp + ".zip")
with zipfile.ZipFile(archive, "w", zipfile.ZIP_DEFLATED, compresslevel=6) as z:
    for p in sorted(stage.rglob("*")):
        if p.is_file():
            z.write(p, p.relative_to(stage).as_posix())

extracted = out / ("clean-extracted-" + stamp)
with zipfile.ZipFile(archive) as z:
    if z.testzip() is not None:
        raise RuntimeError("ZIP CRC failure")
    for name in z.namelist():
        target = (extracted / name).resolve()
        if not target.is_relative_to(extracted.resolve()):
            raise RuntimeError("Archive path escapes extraction directory")
    z.extractall(extracted)
for name, expected in manifest.items():
    p = extracted / name
    assert p.is_file() and sha(p) == expected["sha256"], name
assets = json.loads((extracted / "editable-project/assets.json").read_text(encoding="utf-8"))
for asset in assets["assets"]:
    for variant in asset["variants"].values():
        ref = variant["sourcePath"]
        assert not Path(ref).is_absolute() and ":" not in ref and ".." not in Path(ref).parts, ref
        media = extracted / "editable-project" / ref
        assert media.is_file() and sha(media) == variant["sha256"], ref
build = json.loads((extracted / "official-web-export/build-manifest.json").read_text(encoding="utf-8"))
for variants in build["assetMap"].values():
    for ref in variants.values():
        assert (extracted / "official-web-export" / ref).is_file(), ref
report = {"passed": True, "archive": str(archive), "archiveSha256": sha(archive), "archiveBytes": archive.stat().st_size,
          "fileCount": len(manifest) + 1, "extracted": str(extracted), "stage": str(stage),
          "verified": ["zip CRC", "all archived file hashes", "portable native asset paths", "native media hashes", "official export asset references"],
          "browserTest": "See evidence/ARCHIVE-CHECK.md; integrity checks alone are not a gameplay test."}
(out / "archive-integrity.json").write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
print(json.dumps(report, indent=2))
