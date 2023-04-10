# liquid-simple-covenant

A simple covenant for the Liquid sidechain.

## Prerequisites
- An elements node running on regtest
- Installation of npm
- Installation of typescript

## How to run
<ol>
<li>Make sure you have an elements node running (use <a href="https://github.com/vulpemventures/nigiri">nigiri</a> to run the script as-is)</li>

<li>Change admin1, 123, and 18881 in the string http://admin1:123@localhost:18881 from ElementsClient.ts to your username, password, and port respectively

<li>Open terminal</li>

<li><code>cd</code> to the folder containing the contents of this repo</li>

<li>Run <code>npm install</code></li>

<li>Run <code>ts-node simple-covenant.ts</code></li>

<li>Make sure the first log with the balance shows up to see if you can correctly connect to the elements node</li>

<li>The last log should start with <code>Final transaction id:</code> if everything runs successfully</li>
</ol>
