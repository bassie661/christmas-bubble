Christmas Bubble for Home Assistant | v1.0.2

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
   /local/dashboard-christmas-snow.js?v=1.0.2
4. Add a Manual card and paste examples/light-slider.yaml or examples/switch.yaml.
   Replace entity with your own light or switch. To try both cards together,
   use dashboard.yaml and set both entity IDs. Save and reload the dashboard.

Upgrade from v1.0.0 or v1.0.1
Replace the JavaScript file and change the version on the existing resource
URL to v=1.0.2. Keep any wind parameter. For configurable scenery, copy the
updated styles block from the matching YAML example into each existing card.
Keep your entity IDs and actions. Save and reload the dashboard.

Configure each button
Set these keys alongside entity in the card YAML:
  christmas_trees: 16
  christmas_houses: 3

Choose 0 to 36 trees and 0 to 8 houses. Zero hides that group. Omitting the
keys gives the slider four trees and the switch seven, each with one chalet.
Groves flank the village. Small pines in front of chalet corners count toward
the tree total. Their placement stays
stable while the card is open. Reloading the dashboard draws a new layout
for the corner pines unless you save a layout seed.

Visual editor
Open Christmas scenery in the Christmas Bubble button editor. Set tree and
chalet counts, choose wind direction and configure twilight on light sliders.
Set christmas_house_position to left, center (default), right or spread.
Left and right keep every roof in the selected outer third of the button. Its chalets cluster
in staggered rows. Spread opens up the spacing within the village.
Set christmas_house_clustering to tight, normal (default) or loose to adjust
the spacing between neighbors within the selected area.
Set christmas_house_size to smaller, normal (default) or bigger (up to 10%).
Icon and badge appearance (christmas_controls) accepts default, tinted or solid.
Tinted and solid put the main icon and percentage badge above the scenery.
Set christmas_always_night to true to keep the sky dark and indicate power
with the icon. The dimmer reveals daylight and its fill on hover or drag
and returns to night on release. Its percentage badge stays visible.
Always snowing (christmas_always_snowing) keeps flakes falling between storms.
Always windy (christmas_always_windy) keeps the selected wind blowing between
gusts. Both default to false and can be enabled separately.
About Christmas Bubble Cards shows the installed version and the GitHub link.
Open Scenery settings help for details. Shuffle layout changes the preview.
The arrows revisit layouts from this editing session, including the first one.
Save keeps the selected layout seed across reloads. Cancel discards the preview edits.

Light and wind
The slider changes to daylight above 50% brightness. The switch follows
its on/off state. Set christmas_twilight on the slider from 0 (sharp) to
10 (widest blend), or use an input_number entity. The default is 6.
Wind direction is shared by default. To choose left, right or independent,
set wind on the JavaScript resource URL, then reload the dashboard:
  /local/dashboard-christmas-snow.js?v=1.0.2&wind=left

The English release notes are in CHANGELOG.md. The illustrated guide and
animated previews are available at https://github.com/bassie661/christmas-bubble
