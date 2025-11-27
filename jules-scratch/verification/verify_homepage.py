from playwright.sync_api import sync_playwright, Page, expect
import sys

def verify_homepage(page: Page):
    # Listen for all console events and print them to stderr
    page.on("console", lambda msg: print(f"BROWSER LOG: {msg.text}", file=sys.stderr))

    # Navigate to the homepage
    print("Navigating to homepage (http://127.0.0.1:8080/)...")
    try:
        page.goto("http://127.0.0.1:8080/", timeout=15000)
    except Exception as e:
        print(f"Error navigating to page: {e}", file=sys.stderr)
        page.screenshot(path="jules-scratch/verification/navigation_error.png")
        raise

    # Wait for the network to be idle to allow all resources to load
    print("Waiting for network to be idle...")
    try:
        page.wait_for_load_state('networkidle', timeout=10000)
    except Exception as e:
        print(f"Timed out waiting for network idle: {e}", file=sys.stderr)


    # Take a screenshot for debugging
    print("Taking debug screenshot...")
    page.screenshot(path="jules-scratch/verification/debug_homepage.png")

    # Print the page content to see if anything rendered
    body_content = page.content()
    print("--- PAGE CONTENT START ---")
    print(body_content)
    print("--- PAGE CONTENT END ---")

    # Check for the main heading
    print("Checking for main heading...")
    try:
        heading = page.get_by_role("heading", name="Des soins de santé à domicile")
        expect(heading).to_be_visible(timeout=5000)
        print("Homepage heading found!")
    except Exception as e:
        print(f"Could not find heading: {e}", file=sys.stderr)
        raise

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    page = browser.new_page()
    try:
        verify_homepage(page)
    finally:
        browser.close()