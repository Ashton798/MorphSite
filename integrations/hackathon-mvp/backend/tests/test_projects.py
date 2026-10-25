"""Project and output endpoint tests, isolated from paid providers."""
import os
import tempfile
import unittest

from fastapi.testclient import TestClient

_sandbox = tempfile.TemporaryDirectory(prefix="morphsite-project-tests-")
for _flag in ("GOOGLE_TEXT_ENABLED", "GOOGLE_IMAGE_ENABLED", "GOOGLE_VIDEO_ENABLED", "GOOGLE_TTS_ENABLED"):
    os.environ[_flag] = "false"
os.environ.setdefault("DATABASE_URL", f"sqlite:///{_sandbox.name}/test.db")
os.environ.setdefault("UPLOAD_DIR", f"{_sandbox.name}/uploads")
os.environ.setdefault("OUTPUT_DIR", f"{_sandbox.name}/outputs")
os.environ.setdefault("MOCK_MODE", "true")

from app.main import app


class ProjectApiTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.client = TestClient(app)
        cls.client.__enter__()

    @classmethod
    def tearDownClass(cls):
        cls.client.__exit__(None, None, None)
        _sandbox.cleanup()

    def test_project_brand_spec_versions_and_output_list(self):
        created = self.client.post("/api/projects", json={"name": "VOID COFFEE", "description": "夜间咖啡推广"})
        self.assertEqual(created.status_code, 200, created.text)
        project = created.json()
        self.assertEqual(len(project["id"]), 32)
        version = self.client.post(f"/api/projects/{project['id']}/brand-specs", json={
            "spec_json": '{"brand":{"name":"VOID COFFEE"}}', "prompt": "做一套夜间咖啡推广", "source": "test"
        })
        self.assertEqual(version.status_code, 200, version.text)
        self.assertEqual(version.json()["version"], 1)
        self.assertEqual(self.client.get(f"/api/projects/{project['id']}/brand-specs").json()[0]["version"], 1)
        self.assertEqual(self.client.get(f"/api/projects/{project['id']}/outputs").json(), [])
        refreshed = self.client.get(f"/api/projects/{project['id']}").json()
        self.assertEqual(refreshed["active_brand_spec_version_id"], version.json()["id"])

    def test_assets_return_safe_urls(self):
        project = self.client.post("/api/projects", json={"name": "Assets"}).json()
        from app.models import Asset
        from app.database import SessionLocal
        from app.config import settings
        path = settings.upload_path / f"{project['id']}.png"
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(b"png")
        with SessionLocal() as db:
            db.add(Asset(project_id=project["id"], kind="image", path=str(path), mime_type="image/png", original_name="product.png"))
            db.commit()
        response = self.client.get(f"/api/projects/{project['id']}/assets")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()[0]["url"], f"/api/files/{project['id']}.png")
        self.assertNotIn(str(path), response.text)

    def test_conversation_and_validation(self):
        project = self.client.post("/api/projects", json={"name": "Project"}).json()
        conversation = self.client.post(f"/api/projects/{project['id']}/conversations", json={"title": "Brief"})
        self.assertEqual(conversation.status_code, 200)
        message = self.client.post(f"/api/projects/{project['id']}/conversations/{conversation.json()['id']}/messages", json={"role": "user", "content": "改成粉色"})
        self.assertEqual(message.status_code, 200)
        self.assertEqual(message.json()["content"], "改成粉色")
        self.assertEqual(self.client.get(f"/api/projects/{project['id']}/conversations").json()[0]["id"], conversation.json()["id"])
        self.assertEqual(self.client.get(f"/api/projects/{project['id']}/conversations/{conversation.json()['id']}/messages").json()[0]["content"], "改成粉色")
        self.assertEqual(self.client.get("/api/projects/not-an-id").status_code, 400)
        self.assertEqual(self.client.post(f"/api/projects/{project['id']}/brand-specs", json={"spec_json": "not json"}).status_code, 422)


if __name__ == "__main__":
    unittest.main()
