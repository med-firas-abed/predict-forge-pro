import os
import unittest
from types import SimpleNamespace
from unittest.mock import patch

# Keep tests self-contained when no local prediteq_api/.env file is present.
os.environ.setdefault("SUPABASE_URL", "https://example.supabase.co")
os.environ.setdefault("SUPABASE_SERVICE_KEY", "test-service-role-key")

from core.machine_labels import get_machine_public_label
from routers import chat


class MachineLabelConsistencyTests(unittest.TestCase):
    def test_real_machine_codes_are_not_collapsed_to_demo_ordinals(self):
        self.assertEqual(get_machine_public_label("ASC-A1"), "Machine 1")
        self.assertEqual(get_machine_public_label("ARO-01"), "Machine ARO-01")
        self.assertEqual(
            get_machine_public_label("ARO-01", "Ben Arous pilot"),
            "Machine ARO-01",
        )


class ChatFleetResolutionTests(unittest.TestCase):
    def test_chat_resolves_public_machine_labels_from_current_fleet(self):
        manager = SimpleNamespace(
            machine_cache={
                "ASC-A1": {"id": "uuid-a1", "nom": "Ascenseur demo", "region": "Bizerte"},
                "ARO-01": {"id": "uuid-aro", "nom": "Ben Arous pilot", "region": "Ben Arous"},
            }
        )
        user = SimpleNamespace(id="user-1")

        with patch("routers.chat.get_manager", return_value=manager):
            with patch("routers.chat.get_machine_filter", return_value=None):
                self.assertEqual(chat._resolve_machine_code_reference("Machine 1", user), "ASC-A1")
                self.assertEqual(chat._resolve_machine_code_reference("Machine ARO-01", user), "ARO-01")

                context = chat._build_live_fleet_context(user)

        self.assertIn("Machine 1 => code ASC-A1", context)
        self.assertIn("Machine ARO-01 => code ARO-01", context)


if __name__ == "__main__":
    unittest.main()
