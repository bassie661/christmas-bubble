Christmas Bubble for Home Assistant | v1.0.1

Add a winter village to a Bubble Card light slider or switch. Falling snow
passes in front of and behind chalets and trees, settles on roofs and
branches, and collects against walls. Each chimney has its own smoke cycle.

Install
1. Install Bubble Card through HACS and check that a regular Bubble Card works.
2. Extract christmas-buttons.zip. Copy dashboard-christmas-snow.js into the
   www directory inside your Home Assistant configuration directory. If you
   just created www, restart Home Assistant once.
3. In Settings > Dashboards > menu > Resources, add the following URL as a
   JavaScript module. Enable Advanced Mode in your profile if needed.
   /local/dashboard-christmas-snow.js?v=1.0.1
4. Add a Manual card and paste examples/light-slider.yaml or examples/switch.yaml.
   Replace entity with your own light or switch. To try both cards together,
   use dashboard.yaml and set both entity IDs. Save and reload the dashboard.

Upgrade from v1.0.0
Replace the JavaScript file and change the version on the existing resource
URL to v=1.0.1. Keep any wind parameter. For configurable scenery, copy the
updated styles block from the matching YAML example into each existing card.
Keep your entity IDs and actions. Save and reload the dashboard.

Configure each button
Set these keys alongside entity in the card YAML:
  christmas_trees: 16
  christmas_houses: 3

Choose 0 to 36 trees and 0 to 8 houses. Zero hides that group. Omitting the
keys gives the slider four trees and the switch seven, each with one chalet.
A pine at a chalet corner counts toward the tree total. Its placement stays
stable while the card is open. Reloading the dashboard draws a new layout
for the corner pines.

Light and wind
The slider changes to daylight above 50% brightness. The switch follows
its on/off state. Set christmas_twilight on the slider from 0 (sharp) to
10 (widest blend), or use an input_number entity. The default is 6.
Wind direction is shared by default. To choose left, right or independent,
set wind on the JavaScript resource URL, then reload the dashboard:
  /local/dashboard-christmas-snow.js?v=1.0.1&wind=left

The English release notes are in CHANGELOG.md. The illustrated guide and
animated previews are available at https://github.com/bassie661/christmas-bubble
