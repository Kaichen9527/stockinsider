import unittest

from line_dispatcher import _allowed, _render_message


class TestLineDispatcher(unittest.TestCase):
    def test_event_filtering(self):
        sub = {
            "digest_enabled": True,
            "event_preferences": {
                "hit_target": True,
                "hit_stop_loss": False,
                "daily_digest": True,
            },
        }
        self.assertTrue(_allowed(sub, "hit_target"))
        self.assertFalse(_allowed(sub, "hit_stop_loss"))
        self.assertTrue(_allowed(sub, "daily_digest"))

    def test_message_rendering(self):
        event = {
            "event_type": "hit_target",
            "payload": {
                "symbol": "2330",
                "event": "hit_target",
                "price": 1050,
                "target_price": 1040,
                "stop_loss": 900,
            },
        }
        msg = _render_message(event)
        self.assertIn("2330", msg)
        self.assertIn("hit_target", msg)


if __name__ == '__main__':
    unittest.main()
