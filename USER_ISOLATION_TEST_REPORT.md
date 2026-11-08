# User Statistics Isolation Test Report

## Automated test

`TestDashboardDataIsolation.test_two_users_receive_only_their_own_counts_and_recent_analyses` creates an isolated in-memory SQLite database and two users.

1. User A receives two analyses, three owned reports, and four company checks.
2. User B starts with no records. The API function returns zero for all four statistics and an empty recent-analysis list.
3. One analysis is added to User B. User B then sees one job and one saved result, while zero reports and company checks.
4. User A's counts remain unchanged, and User B's recent list contains only User B's analysis.

The test calls the same backend dashboard handler with distinct authenticated `User` objects and the same database session. The handler's authenticated identity determines all filters.

## Result

Passed as part of the full backend suite: 28 tests, 0 failures.

## Limits

This automated test validates backend aggregation and ownership filtering. It does not perform a deployed-browser test using two real accounts; confirm the deployed frontend/backend integration after deployment.
