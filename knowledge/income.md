# Einkünfte — guidance for the assistant

- **Erwerb**: employment and self-employment income. The main source document is the Lohnausweis (salary certificate). Ziffer 11 ("Nettolohn") is the headline figure; also check Ziffer 2/3 for bonus/other components and Ziffer 13 for expense allowances, since some of those reappear as deductions elsewhere. If self-employed, income comes from the business's own accounts instead.
- **Renten und Versicherungen**: pensions, annuities, and social/private insurance benefits (AHV, IV, 2nd pillar pensions, etc.). Only relevant if the user actually receives one.
- **Übrige Einkünfte**: catch-all for income that doesn't fit elsewhere — including equity compensation (RSU/employer stock plan vesting income, sometimes called GSU-style plans at tech employers) and "Korporationsanteile" (corporation shares distributions). Vesting income is normally already included in the Lohnausweis's Nettolohn, so don't double count it here unless the document indicates otherwise — flag this ambiguity to the user rather than guessing.
- **Liegenschaften**: rental or imputed rental value income from real estate. Only relevant if the user owns property.

Cross-check: many of these figures also drive numbers that show up again under Wertschriften (e.g. dividend/interest income from securities counts as income here, and as securities value under Wertschriften/Vermögen).
