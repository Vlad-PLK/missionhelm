     1|# Demo Deployment Guide
     2|
     3|Deploy La Citadel as a live, read-only demo at `demo.your-domain.example`.
     4|
     5|## Server: your-demo-host
     6|
     7|**SSH:** `ssh your-demo-host` (or `ssh root@YOUR_SERVER_IP -p YOUR_SSH_PORT`)
     8|
     9|---
    10|
    11|## Step 1: Install Node.js (if not installed)
    12|
    13|```bash
    14|curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
    15|apt-get install -y nodejs
    16|node --version  # Should be v20+
    17|```
    18|
    19|## Step 2: Clone the repo
    20|
    21|```bash
    22|cd /var/www
    23|git clone https://github.com/YOUR_ORG/YOUR_REPO.git la citadel-demo
    24|cd la citadel-demo
    25|```
    26|
    27|## Step 3: Install dependencies
    28|
    29|```bash
    30|npm install
    31|```
    32|
    33|## Step 4: Create environment file
    34|
    35|```bash
    36|cat > .env.local << 'EOF'
    37|# Demo mode — read-only, no auth needed
    38|DEMO_MODE=true
    39|DATABASE_PATH=./la citadel-demo.db
    40|PORT=4000
    41|EOF
    42|```
    43|
    44|## Step 5: Build
    45|
    46|```bash
    47|npm run build
    48|```
    49|
    50|## Step 6: Initialize and seed the database
    51|
    52|```bash
    53|# Start briefly to create schema
    54|PORT=4000 npx next start -p 4000 &
    55|sleep 5
    56|curl -s http://localhost:4000/api/workspaces > /dev/null
    57|kill %1
    58|sleep 2
    59|
    60|# Seed demo data
    61|node scripts/demo-seed.js --db ./la citadel-demo.db
    62|```
    63|
    64|## Step 7: Install PM2 and start services
    65|
    66|```bash
    67|npm install -g pm2
    68|
    69|# Start La Citadel
    70|pm2 start "npx next start -p 4000" --name mc-demo --cwd /var/www/la citadel-demo
    71|
    72|# Start the simulator (generates live activity every 15 seconds)
    73|pm2 start scripts/demo-simulator.js --name mc-simulator --cwd /var/www/la citadel-demo -- --db ./la citadel-demo.db --interval 15000
    74|
    75|# Save for auto-restart
    76|pm2 save
    77|pm2 startup  # Follow the output command
    78|```
    79|
    80|## Step 8: Set up Cloudflare tunnel
    81|
    82|In the Cloudflare dashboard for your domain:
    83|
    84|1. Go to **DNS** → Add a CNAME record:
    85|   - **Name:** `demo`
    86|   - **Target:** (your tunnel hostname)
    87|   - **Proxy:** ON (orange cloud)
    88|
    89|2. Or if using `cloudflared`:
    90|```bash
    91|cloudflared tunnel route dns <tunnel-id> demo.your-domain.example
    92|```
    93|
    94|3. Add the tunnel config to route `demo.your-domain.example` → `http://localhost:4000`
    95|
    96|---
    97|
    98|## Verify
    99|
   100|- Visit `https://demo.your-domain.example`
   101|- You should see the demo banner at the top
   102|- Tasks should be moving through the kanban board
   103|- Live feed should show agent activity
   104|- Try clicking "+ New Task" — should get a "demo mode" error toast
   105|
   106|## Maintenance
   107|
   108|```bash
   109|# Check status
   110|pm2 list
   111|
   112|# View simulator output
   113|pm2 logs mc-simulator --lines 20
   114|
   115|# Reset demo data (re-seed)
   116|pm2 stop mc-simulator mc-demo
   117|rm la citadel-demo.db*
   118|pm2 start mc-demo
   119|sleep 5
   120|curl -s http://localhost:4000/api/workspaces > /dev/null
   121|pm2 stop mc-demo
   122|node scripts/demo-seed.js --db ./la citadel-demo.db
   123|pm2 start mc-demo mc-simulator
   124|
   125|# Update code
   126|git pull
   127|npm install
   128|npm run build
   129|pm2 restart all
   130|```
   131|