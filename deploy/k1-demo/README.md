# k1.monkflow.io (family-office K-1 demo)

A static copy of the built portal, served from the Mac mini on 127.0.0.1:8508 and reached through the
`cresa-demo` Cloudflare tunnel. Fictional data only. Cloudflare Access is the only gate; there is no access code.

## Refresh after a code change
    cd ~/MonkFlowUI && npm run build
    rsync -a --delete dist/portal/ ~/monkflow-demos/k1-site/portal/
    cp deploy/k1-demo/serve.py ~/monkflow-demos/k1-site/serve.py
    launchctl kickstart -k gui/$(id -u)/io.monkflow.k1-demo

The served copy lives outside the repository so that switching branches cannot change what visitors see.

## Going live (order matters: the gate goes on before the door opens)
1. Cloudflare dashboard, Zero Trust, Access, Applications: add a self-hosted application for `k1.monkflow.io`
   with a policy that allows only the listed email addresses (one-time PIN sign-in).
2. DNS: `cloudflared tunnel route dns cresa-demo k1.monkflow.io`
3. Add to `~/.cloudflared/cresa-demo.yml`, above the final 404 rule:

       - hostname: k1.monkflow.io
         service: http://127.0.0.1:8508

4. `launchctl kickstart -k gui/$(id -u)/io.monkflow.cresa-tunnel`
5. Open https://k1.monkflow.io signed out: it must show the Access sign-in, not the demo.
