import { PRICING_SOURCE_URL, PRICING_VERSION } from "@/lib/pricing";

export function CostDisclaimer() {
  return (
    <p className="text-xs leading-relaxed text-muted">
      Costs are <strong className="text-white">estimates</strong>, not billing figures. They are calculated from the token
      counts the Gemini API reports for each session, multiplied by list prices ({PRICING_VERSION};{" "}
      <a href={PRICING_SOURCE_URL} className="underline hover:text-white" target="_blank" rel="noreferrer">
        source
      </a>
      ). Each turn re-sends the conversation context, and every turn is counted. Thinking tokens are priced at the
      text-output rate (an assumption). Caching discounts are not applied, and your actual bill may differ.
    </p>
  );
}
