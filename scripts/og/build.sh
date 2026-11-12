#!/bin/sh
# Regenerates the link-preview images in assets/og/ with headless Chrome.
#   sh scripts/og/build.sh
set -e
cd "$(dirname "$0")/../.."
CHROME="${CHROME:-/Applications/Google Chrome.app/Contents/MacOS/Google Chrome}"
card() { # name, eyebrow, headline
  "$CHROME" --headless=new --disable-gpu --hide-scrollbars --window-size=1200,630 --virtual-time-budget=5000 \
    --screenshot="assets/og/$1.png" "file://$PWD/scripts/og/card.html?e=$2&t=$3" 2>/dev/null
  echo "assets/og/$1.png"
}
card home "For%20CRE%20firms%2C%20banks%20and%20investment%20firms" "Software%20built%20around%20how%20your%20deals%2C%20loans%20and%20investors%20actually%20move."
card commercial-real-estate "For%20commercial%20real%20estate%20firms" "Underwrite%20more%20deals%20without%20hiring%20more%20analysts."
card banks "For%20community%2C%20regional%20and%20commercial%20banks" "Close%20commercial%20loans%20faster%2C%20without%20replacing%20your%20core."
card investment-firms "For%20investment%20firms%20and%20RIAs" "Investor%20operations%20that%20run%20without%20the%20re-typing."
# Square logo for structured data
printf '<body style="margin:0;background:#f6f5f1;display:grid;place-items:center;width:512px;height:512px"><img src="../../logo-mark.svg" style="width:360px;height:396px">' > scripts/og/.logo.html
"$CHROME" --headless=new --disable-gpu --hide-scrollbars --window-size=512,512 --screenshot="assets/og/logo.png" "file://$PWD/scripts/og/.logo.html" 2>/dev/null
rm scripts/og/.logo.html
echo "assets/og/logo.png"
