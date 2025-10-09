from playwright.sync_api import sync_playwright, Page, expect
import sys

def run_verification(page: Page):
    base_url = "http://127.0.0.1:8080"

    # 1. Verify that the homepage loads correctly
    print("Verifying homepage...")
    try:
        page.goto(base_url, timeout=15000)
        expect(page.get_by_role("heading", name="Des soins de santé à domicile")).to_be_visible(timeout=10000)
        page.screenshot(path="jules-scratch/verification/homepage_loads.png")
        print("Homepage verification successful.")
    except Exception as e:
        print(f"Homepage verification failed: {e}", file=sys.stderr)
        page.screenshot(path="jules-scratch/verification/homepage_error.png")
        raise

    # 2. Verify that dashboard routes are protected
    print("\nVerifying protected routes...")
    try:
        # Test patient dashboard
        print("  - Navigating to /dashboard/patient...")
        page.goto(f"{base_url}/dashboard/patient")
        expect(page.get_by_role("heading", name="Se connecter")).to_be_visible(timeout=5000)
        print("  - Redirected to /login successfully.")

        # Test practitioner dashboard
        print("  - Navigating to /dashboard/practitioner...")
        page.goto(f"{base_url}/dashboard/practitioner")
        expect(page.get_by_role("heading", name="Se connecter")).to_be_visible(timeout=5000)
        print("  - Redirected to /login successfully.")

        page.screenshot(path="jules-scratch/verification/protected_route_redirect.png")
        print("Protected routes verification successful.")
    except Exception as e:
        print(f"Protected routes verification failed: {e}", file=sys.stderr)
        page.screenshot(path="jules-scratch/verification/protected_route_error.png")
        raise

    # 3. Verify Mapbox token handling
    print("\nVerifying Mapbox token handling...")
    try:
        page.goto(f"{base_url}/search-practitioners")
        expect(page.get_by_text("Le token Mapbox n'est pas configuré")).to_be_visible(timeout=5000)
        page.screenshot(path="jules-scratch/verification/mapbox_token_handling.png")
        print("Mapbox token handling verification successful.")
    except Exception as e:
        print(f"Mapbox token handling verification failed: {e}", file=sys.stderr)
        page.screenshot(path="jules-scratch/verification/mapbox_error.png")
        raise

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    page = browser.new_page()
    try:
        run_verification(page)
        print("\nAll verifications passed!")
    finally:
        browser.close()