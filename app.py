import os
import time
import hashlib
import requests
import xml.etree.ElementTree as ET
from bs4 import BeautifulSoup
from flask import Flask, jsonify, render_template, request

app = Flask(__name__)

# Constants
FEED_URL = "https://docs.cloud.google.com/feeds/bigquery-release-notes.xml"
CACHE_EXPIRATION_SECONDS = 300  # 5 minutes cache

# Simple in-memory cache
cache = {
    "data": None,
    "last_fetched": 0
}

def clean_html_content(soup_content):
    """
    Clean up any target links to open in a new tab and ensure formatting is correct.
    """
    for link in soup_content.find_all("a"):
        link["target"] = "_blank"
        link["rel"] = "noopener noreferrer"
    return str(soup_content)

def parse_release_notes():
    """
    Fetches the XML feed, parses the Atom entries, and splits them into individual updates.
    """
    headers = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
    }
    
    response = requests.get(FEED_URL, headers=headers, timeout=15)
    response.raise_for_status()
    
    root = ET.fromstring(response.content)
    ns = {"atom": "http://www.w3.org/2005/Atom"}
    
    updates = []
    
    entries = root.findall("atom:entry", ns)
    for entry in entries:
        date_str = entry.find("atom:title", ns).text
        updated_iso = entry.find("atom:updated", ns).text
        
        link_el = entry.find("atom:link", ns)
        base_link = link_el.attrib.get("href") if link_el is not None else ""
        
        content_el = entry.find("atom:content", ns)
        if content_el is None or not content_el.text:
            continue
            
        soup = BeautifulSoup(content_el.text, "html.parser")
        headings = soup.find_all(["h2", "h3", "h4"])
        
        if not headings:
            # Fallback: if no headings, parse as a single general update
            html_cleaned = clean_html_content(soup)
            text_cleaned = soup.get_text().strip()
            
            # Create a unique ID
            unique_str = f"{date_str}-General-{text_cleaned[:50]}"
            update_id = hashlib.md5(unique_str.encode("utf-8")).hexdigest()
            
            updates.append({
                "id": update_id,
                "date": date_str,
                "updated_iso": updated_iso,
                "type": "General",
                "html": html_cleaned,
                "text": text_cleaned,
                "link": base_link
            })
        else:
            for idx, h in enumerate(headings):
                update_type = h.text.strip()
                
                # Gather siblings until the next heading
                sibling_content = []
                sibling = h.next_sibling
                while sibling and sibling.name not in ["h2", "h3", "h4"]:
                    sibling_content.append(sibling)
                    sibling = sibling.next_sibling
                
                # Render content to HTML & plain text
                sub_soup = BeautifulSoup("", "html.parser")
                for item in sibling_content:
                    sub_soup.append(item)
                
                html_cleaned = clean_html_content(sub_soup)
                text_cleaned = sub_soup.get_text().strip()
                
                if not text_cleaned:
                    continue
                
                # Use base link directly to scroll to the correct date
                anchor_link = base_link
                
                # Create a unique ID
                unique_str = f"{date_str}-{update_type}-{text_cleaned[:50]}"
                update_id = hashlib.md5(unique_str.encode("utf-8")).hexdigest()
                
                updates.append({
                    "id": update_id,
                    "date": date_str,
                    "updated_iso": updated_iso,
                    "type": update_type,
                    "html": html_cleaned,
                    "text": text_cleaned,
                    "link": anchor_link
                })
                
    return updates

@app.route("/")
def index():
    return render_template("index.html")

@app.route("/api/release-notes")
def get_release_notes():
    force_refresh = request.args.get("force_refresh", "false").lower() == "true"
    current_time = time.time()
    
    if force_refresh or not cache["data"] or (current_time - cache["last_fetched"] > CACHE_EXPIRATION_SECONDS):
        try:
            updates = parse_release_notes()
            cache["data"] = updates
            cache["last_fetched"] = current_time
            return jsonify({
                "status": "success",
                "cached": False,
                "timestamp": current_time,
                "data": updates
            })
        except Exception as e:
            # Return cached data if available as a fallback on failure
            if cache["data"]:
                return jsonify({
                    "status": "fallback_success",
                    "cached": True,
                    "timestamp": cache["last_fetched"],
                    "error": str(e),
                    "data": cache["data"]
                })
            return jsonify({
                "status": "error",
                "message": f"Failed to fetch release notes: {str(e)}"
            }), 500
    
    return jsonify({
        "status": "success",
        "cached": True,
        "timestamp": cache["last_fetched"],
        "data": cache["data"]
    })

if __name__ == "__main__":
    app.run(debug=True, host="127.0.0.1", port=5000)
