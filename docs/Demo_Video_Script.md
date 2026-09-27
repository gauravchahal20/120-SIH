# ThermoLift: 3-Minute Demo Video Script

Record your screen with OBS, the Xbox Game Bar (Win + G) or Loom. Speak slowly. Use a 1080p browser window at full screen.

| Time | On screen | What to say |
|---|---|---|
| 0:00–0:20 | Title slide of the PPT | "We are team <name>, and this is ThermoLift for problem statement 26120 from Oil India. Baghewala's heavy oil thickens as the reservoir cools after steam. The pump keeps running at a fixed speed, so rods float and fail and steam is wasted." |
| 0:20–0:50 | **Well Overview** tab, manual SPM mode. Set Manual SPM to 7, then press **Play**. | "This is a live digital twin of well BGW-07. Brown is near-well temperature and blue is the oil rate. Baghewala crude is 10,000 to 13,000 centipoise at 50 °C. As the well cools, the oil thickens again. We calculate how fast the rod string can sink against the drag of this thick oil in the tubing. At a fixed 7 SPM the rods can't keep up, and the pink band is rod float. The pump-speed tag turns red on the faceplate and the process graphic, and a priority-1 alarm is raised." |
| 0:50–1:05 | Point to the **Alarm summary** and the **dynamometer cards** | "Alarms follow the ISA-101 style, where colour appears only when something is abnormal. The dynamometer cards come from the Gibbs wave equation for the 1,100 m rod string: the surface load goes below zero on the downstroke, which is rod float, and peaks far above the rod allowable." |
| 1:05–1:40 | Click **Run optimiser**. Scroll to the comparison table and heat map. | "The AI optimiser searches steam volume, pressure, soak time and stroke length together, and switches the pump to adaptive SPM. On this cycle-4 sample well it gives about 19% more oil per cycle, a 25% lower steam-oil ratio, no rod float or fluid pound, and half the pump energy. Optimising the pump alone gives 7%, and the steam alone 4%. Together they give 19%." |
| 1:40–2:00 | **Operating advisory** panel. Move the oil-price slider. Click **Cycle report…**. | "Every recommendation is explained, so the field engineer knows why, including whether the downhole heater pays for itself. If the oil price changes, the optimum changes too. One click creates a report for the engineer to approve." |
| 2:00–2:20 | **Field Overview** tab. Change mobile steam units from 2 to 1. | "The field overview shows every well's live status. The scheduler plans the mobile steam units across wells. With one unit instead of two, wells wait 22 days and about 900 barrels are deferred, so managers can see what a second unit is worth." |
| 2:20–2:45 | **Models & Data** tab. Click **Train on sample set**, then **Diagnose random card**. | "The models learn from OIL's own data: production, CSS records, VFD data and failure history. Here the cycle model reaches R² 0.80 and the card classifier 94%. And every model is checked automatically: 17 out of 17 validation checks pass. OIL can upload its CSV and retrain instantly." |
| 2:45–3:00 | Back to the Well Overview | "ThermoLift joins the reservoir, wellbore and pump in one loop, which means more oil, less steam and fewer failures. Thank you." |

**Tip:** the prototype also has a **Guided demo (2 min)** button; judges who open the link can follow it on their own.

**Say this once in the video:** "The prototype runs on synthetic data because field data isn't public. It is designed to be trained on Oil India's historical records."
