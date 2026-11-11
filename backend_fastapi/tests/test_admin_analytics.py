"""Database-backed admin analytics tests using isolated SQLite fixtures."""
import json
import asyncio
import sys
import unittest

if sys.platform == "win32":
    asyncio.set_event_loop_policy(asyncio.WindowsSelectorEventLoopPolicy())

from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

from backend_fastapi import main
from backend_fastapi.database import Base
from backend_fastapi.models import Analysis, Company, CompanyVerification, ScamReport, User
from backend_fastapi.schemas import UpdateUserInput


class AdminAnalyticsTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        self.engine = create_async_engine("sqlite+aiosqlite:///:memory:")
        async with self.engine.begin() as conn:
            await conn.run_sync(Base.metadata.create_all)
        self.factory = async_sessionmaker(self.engine, expire_on_commit=False)

    async def asyncTearDown(self):
        await self.engine.dispose()

    async def test_empty_database_returns_zero_metrics_and_empty_trends(self):
        async with self.factory() as db:
            result = await main._admin_analytics_data(db, "all", None, None)
        self.assertEqual(result["cards"]["totalUsers"], 0)
        self.assertEqual(result["cards"]["jobsAnalyzed"], 0)
        self.assertEqual(result["cards"]["scamsDetected"], 0)
        self.assertEqual(result["cards"]["totalReports"], 0)
        self.assertEqual(result["cards"]["companyChecks"], 0)
        self.assertEqual(result["monthly"], [])
        self.assertEqual(result["scamCategories"], [])
        self.assertEqual(sum(row["count"] for row in result["riskDistribution"]), 0)

    async def test_aggregates_real_records_and_signal_categories(self):
        async with self.factory() as db:
            db.add_all([
                User(id="admin", name="Admin", email="admin@example.com", password_hash="scrypt:x:y", role="admin", status="Active"),
                User(id="active", name="Active", email="active@example.com", password_hash="scrypt:x:y", role="user", status="Active"),
                User(id="inactive", name="Inactive", email="inactive@example.com", password_hash="scrypt:x:y", role="user", status="Inactive"),
                User(id="review", name="Review", email="review@example.com", password_hash="scrypt:x:y", role="user", status="Review"),
                Analysis(
                    id="analysis-1", user_id="active", input_type="manual", risk="Critical", probability=92,
                    signals=json.dumps([{"category": "payment", "triggered": True}, {"category": "verification", "triggered": False}]),
                ),
                Analysis(
                    id="analysis-2", user_id="active", input_type="manual", risk="Medium", probability=43,
                    signals=json.dumps([{"category": "payment", "triggered": True}]),
                ),
                ScamReport(id="report-1", company="Example Ltd", reporter="Student", status="Pending", risk_level="High"),
                Company(id="company-1", name="Example Ltd", domain="example.com", status="Verified", reports=1),
                CompanyVerification(id="check-1", user_id="active", query="Example", company_name="Example Ltd", status="Verified"),
            ])
            await db.commit()
            result = await main._admin_analytics_data(db, "all", None, None)

        cards = result["cards"]
        self.assertEqual(cards["totalUsers"], 3)
        self.assertEqual(cards["activeUsers"], 1)
        self.assertEqual(cards["inactiveUsers"], 1)
        self.assertEqual(cards["reviewUsers"], 1)
        self.assertEqual(cards["jobsAnalyzed"], 2)
        self.assertEqual(cards["scamsDetected"], 1)
        self.assertEqual(cards["highRiskDetections"], 1)
        self.assertEqual(cards["mediumRiskDetections"], 1)
        self.assertEqual(cards["totalReports"], 1)
        self.assertEqual(cards["reportsPending"], 1)
        self.assertEqual(cards["verifiedCompanies"], 1)
        self.assertEqual(cards["companyChecks"], 1)
        self.assertEqual(result["scamCategories"], [{"category": "payment", "count": 2}])
        self.assertEqual(sum(row["jobs"] for row in result["monthly"]), 2)
        self.assertEqual(sum(row["scams"] for row in result["monthly"]), 1)
        self.assertEqual(sum(row["registrations"] for row in result["monthly"]), 3)

    async def test_user_search_and_pagination_are_server_side(self):
        async with self.factory() as db:
            admin = User(id="admin", name="Admin", email="admin@example.com", password_hash="scrypt:x:y", role="admin", status="Active")
            db.add_all([
                admin,
                User(id="a", name="Alex", email="alex@example.com", password_hash="scrypt:x:y", role="user", status="Active"),
                User(id="b", name="Bailey", email="bailey@example.com", password_hash="scrypt:x:y", role="user", status="Inactive"),
            ])
            await db.commit()
            result = await main.list_users(
                q="alex", status=None, role="user", date_from=None, date_to=None,
                sort_by="name", sort_order="asc", page=1, page_size=1, user=admin, db=db,
            )
        self.assertEqual(result["total"], 1)
        self.assertEqual([item["email"] for item in result["users"]], ["alex@example.com"])
        self.assertEqual(result["total_pages"], 1)

    async def test_last_active_admin_cannot_be_demoted(self):
        async with self.factory() as db:
            admin = User(id="admin", name="Admin", email="admin@example.com", password_hash="scrypt:x:y", role="admin", status="Active")
            db.add(admin)
            await db.commit()
            with self.assertRaises(main.HTTPException) as raised:
                await main.update_user("admin", UpdateUserInput(role="user"), admin, db)
        self.assertEqual(raised.exception.status_code, 409)

    async def test_csv_export_includes_range_totals_and_scam_series(self):
        async with self.factory() as db:
            admin = User(id="admin", name="Admin", email="admin@example.com", password_hash="scrypt:x:y", role="admin", status="Active")
            db.add(admin)
            await db.commit()
            result = await main.export_admin_analytics("all", None, None, admin, db)
        self.assertIn("date_from,all time", result.body.decode())
        self.assertIn("scams_detected_high_or_critical", result.body.decode())


if __name__ == "__main__":
    unittest.main()
