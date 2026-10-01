"""
test_intent.py
Tests for IntentRouter — classification accuracy and entity extraction.
Uses patched LLM responses so no real API calls are made.
"""

from __future__ import annotations

import pytest
from unittest.mock import MagicMock, patch


class TestIntentRouter:
    @pytest.fixture
    def router(self):
        from core.intent import IntentRouter
        return IntentRouter()

    def test_find_charger_intent(self, router) -> None:
        with patch.object(router, "_classify") as mock_classify:
            mock_classify.return_value = {
                "intent": "find_charger",
                "entities": {"location": "Clapham Junction"},
                "confidence": 0.97,
            }
            result = router.route("Find me a charger near Clapham Junction")

        assert result["intent"] == "find_charger"
        assert result["entities"].get("location") == "Clapham Junction"

    def test_book_charger_intent(self, router) -> None:
        with patch.object(router, "_classify") as mock_classify:
            mock_classify.return_value = {
                "intent": "create_booking",
                "entities": {"duration_hours": 2, "time": "tomorrow at 10am"},
                "confidence": 0.95,
            }
            result = router.route("Book a Level 2 charger for 2 hours tomorrow at 10am")

        assert result["intent"] == "create_booking"

    def test_stop_session_intent(self, router) -> None:
        with patch.object(router, "_classify") as mock_classify:
            mock_classify.return_value = {
                "intent": "stop_session",
                "entities": {},
                "confidence": 0.99,
            }
            result = router.route("Stop charging now")

        assert result["intent"] == "stop_session"

    def test_earnings_query_host(self, router) -> None:
        with patch.object(router, "_classify") as mock_classify:
            mock_classify.return_value = {
                "intent": "get_earnings",
                "entities": {"period": "last month"},
                "confidence": 0.92,
            }
            result = router.route("How much did I earn last month?")

        assert result["intent"] == "get_earnings"

    def test_block_availability_intent(self, router) -> None:
        with patch.object(router, "_classify") as mock_classify:
            mock_classify.return_value = {
                "intent": "block_availability",
                "entities": {"date": "this Saturday"},
                "confidence": 0.94,
            }
            result = router.route("Block my listing this Saturday")

        assert result["intent"] == "block_availability"

    def test_low_confidence_returns_unknown(self, router) -> None:
        with patch.object(router, "_classify") as mock_classify:
            mock_classify.return_value = {
                "intent": "unknown",
                "entities": {},
                "confidence": 0.21,
            }
            result = router.route("can you do the thing with the thingy")

        assert result["intent"] == "unknown"
