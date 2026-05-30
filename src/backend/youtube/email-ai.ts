/**
 * AI + strategy for creator email outreach and auto-negotiation.
 *
 * Ports the reference `ai_outreach.py` + `auto_negotiator.py`:
 *   - generateOutreachEmail: warm, personalized first-touch email.
 *   - analyzeReply: classify a creator reply (accept / reject / counter + ask).
 *   - calculateCounterOffer: gradual within-budget counter strategy.
 *   - varied response + follow-up templates so emails never look templated.
 *
 * The negotiator always tries to lock the deal inside the campaign's max
 * offer and is polite + brand-friendly, like a human social-media manager.
 */
import { z } from "zod";
import { meteredGenerateObject, pickAvailableModel } from "@/backend/llm";

// ---------------------------------------------------------------------------
// Outreach email generation
// ---------------------------------------------------------------------------

const outreachSchema = z.object({
  subject: z.string().min(3).max(160),
  body: z.string().min(40).max(2400),
});

export type OutreachEmail = z.infer<typeof outreachSchema>;

export async function generateOutreachEmail(args: {
  workspaceId: string;
  recipientName: string;
  campaignName: string;
  brief: string;
  topic: string;
  budgetMin: number;
  budgetMax: number;
  requirements?: string;
  deadline?: string;
  senderName: string;
}): Promise<OutreachEmail> {
  const model = pickAvailableModel("claude-haiku-4-5") ?? pickAvailableModel("gpt-4o-mini");
  const fallback: OutreachEmail = {
    subject: `Collaboration opportunity${args.topic ? ` — ${args.topic}` : ""}`,
    body: `Hi ${args.recipientName || "there"},

I came across your content and loved it. We're running a collaboration${
      args.topic ? ` around ${args.topic}` : ""
    } and would love to work with you.

${args.brief || ""}

Budget range: $${args.budgetMin.toLocaleString()} - $${args.budgetMax.toLocaleString()}.

To tailor this, could you share your rate, a quick analytics snapshot, and your typical reach? Looking forward to hearing from you!

Best,
${args.senderName}`,
  };
  if (!model) return fallback;

  const prompt = `Write a professional, personalized influencer-outreach email for a brand collaboration.

CREATOR: ${args.recipientName || "the creator"}
CAMPAIGN: ${args.campaignName}
BRIEF: ${args.brief || "(none)"}
TOPIC/PRODUCT: ${args.topic || "(unspecified)"}
BUDGET RANGE: $${args.budgetMin} - $${args.budgetMax}
REQUIREMENTS: ${args.requirements || "Flexible based on the creator's style"}
DEADLINE: ${args.deadline || "Flexible"}
SENDER: ${args.senderName}

RULES:
1. Warm, human, not template-y. Reference that you like their content.
2. Explain the opportunity clearly without being pushy.
3. Mention the budget range so they know you're serious.
4. End by asking them to share: their rate, a quick analytics snapshot, and typical reach.
5. Body under 180 words. Sign off as "${args.senderName}".`;

  try {
    const { object } = await meteredGenerateObject(prompt, outreachSchema, {
      workspaceId: args.workspaceId,
      reason: "youtube.outreach_email",
      model,
    });
    return object;
  } catch {
    return fallback;
  }
}

// ---------------------------------------------------------------------------
// Reply analysis
// ---------------------------------------------------------------------------

const replySchema = z.object({
  accepted: z.boolean(),
  rejected: z.boolean(),
  counterOffer: z.boolean(),
  requestedAmount: z.number().nullable(),
  sentiment: z.enum(["positive", "neutral", "negative"]),
  summary: z.string().max(200),
});

export type ReplyAnalysis = z.infer<typeof replySchema>;

export async function analyzeReply(args: {
  workspaceId: string;
  replyText: string;
  currentOffer: number;
  maxOffer: number;
  budgetMin: number;
}): Promise<ReplyAnalysis> {
  const model = pickAvailableModel("claude-haiku-4-5") ?? pickAvailableModel("gpt-4o-mini");
  const neutral: ReplyAnalysis = {
    accepted: false,
    rejected: false,
    counterOffer: true,
    requestedAmount: null,
    sentiment: "neutral",
    summary: "Needs negotiation",
  };
  if (!model) return neutral;

  const prompt = `Analyze this creator's reply to a sponsorship offer.

Our current offer: $${args.currentOffer > 0 ? args.currentOffer : args.budgetMin}
Our max budget (never reveal): $${args.maxOffer}

Creator's reply:
"""${args.replyText.slice(0, 1500)}"""

Determine:
- accepted: true ONLY if they agree to the current price / say "let's do it".
- rejected: true ONLY if not interested at ANY price ("not interested", "can't collaborate").
- counterOffer: true if they want more money or state a rate.
- requestedAmount: the number they ask for, or null. "I charge $X" / "my rate is $X" => counterOffer with requestedAmount=X (NOT rejection).
- sentiment, and a one-line summary.`;

  try {
    const { object } = await meteredGenerateObject(prompt, replySchema, {
      workspaceId: args.workspaceId,
      reason: "youtube.analyze_reply",
      model,
    });
    return object;
  } catch {
    return neutral;
  }
}

// ---------------------------------------------------------------------------
// Counter-offer strategy (pure logic, ported from calculate_counter_offer)
// ---------------------------------------------------------------------------

export type CounterAction = "accept" | "counter" | "final_offer" | "decline";
export type CounterDecision = { offer: number; action: CounterAction };

const roundTo50 = (n: number) => Math.round(n / 50) * 50;

export function calculateCounterOffer(args: {
  currentOffer: number;
  creatorAsk: number | null;
  budgetMin: number;
  maxOffer: number;
  round: number;
}): CounterDecision {
  const { creatorAsk, budgetMin, maxOffer, round } = args;
  const steps = [
    budgetMin * 0.85,
    budgetMin,
    budgetMin * 1.15,
    budgetMin * 1.3,
    maxOffer * 0.9,
    maxOffer,
  ];
  const baseOffer = steps[Math.min(round, steps.length - 1)] ?? maxOffer;

  if (creatorAsk != null && creatorAsk > 0) {
    if (creatorAsk <= maxOffer) {
      if (creatorAsk <= baseOffer) {
        return { offer: creatorAsk, action: "accept" };
      }
      if (creatorAsk <= maxOffer * 0.95) {
        const mid = Math.min((baseOffer + creatorAsk) / 2, maxOffer);
        return { offer: roundTo50(mid), action: "counter" };
      }
      return { offer: creatorAsk, action: "accept" };
    }
    // Above our max.
    if (creatorAsk <= maxOffer * 1.3) {
      return { offer: maxOffer, action: "final_offer" };
    }
    return { offer: maxOffer, action: "decline" };
  }

  const newOffer = roundTo50(Math.min(baseOffer, maxOffer));
  if (newOffer >= maxOffer) return { offer: maxOffer, action: "final_offer" };
  return { offer: newOffer, action: "counter" };
}

// ---------------------------------------------------------------------------
// Varied templates — keep the AI agent's emails human and non-repetitive.
// ---------------------------------------------------------------------------

const pick = <T,>(arr: T[]): T => arr[Math.floor(Math.random() * arr.length)]!;

const NEGOTIATION_TEMPLATES = [
  `Thanks for getting back to me! I really appreciate you sharing your rates.

After checking with our team, we can go up to $\{offer} for this collaboration.

{extra}

Would this work for you?

Best,
{sender}`,
  `Appreciate the quick response!

I've discussed with our budget team and we can offer $\{offer}. {extra}

Let me know if that works!

Cheers,
{sender}`,
  `Thanks for your response!

We'd love to make this work. Our best offer is $\{offer}. {extra}

What do you think?

Best regards,
{sender}`,
];

const COUNTER_EXTRAS = [
  "We're flexible on deliverables if that helps.",
  "Happy to discuss the content scope to make it work.",
  "We can be flexible on timeline if needed.",
  "Open to adjusting requirements to fit the budget.",
];

const ACCEPTANCE_TEMPLATES = [
  `Awesome! Let's do $\{amount} — really excited to work together!

Our team will send over the brief and payment details shortly.

Looking forward to this collab!

Best,
{sender}`,
  `Perfect, $\{amount} works great! Super excited about this partnership.

You'll receive the content brief and payment info soon.

Can't wait to see what you create!

Cheers,
{sender}`,
];

const FINAL_OFFER_TEMPLATES = [
  `I really want to make this work!

$\{offer} is genuinely the highest we can go for this campaign — it's our absolute max budget.

If this works, I'd love to move forward. If not, totally understand!

Let me know either way.

Best,
{sender}`,
  `Thanks for your patience in discussing this!

I've pushed internally and $\{offer} is truly our ceiling for this project.

Would love to work together if this fits your rate. No pressure either way!

Cheers,
{sender}`,
];

const GOODBYE_TEMPLATES = [
  `Thanks for considering our offer!

Totally understand. If things change or you're interested in future projects, reach out anytime.

Best of luck with your content!

{sender}`,
  `No worries at all!

Appreciate you taking the time to chat. Feel free to reach out if you'd like to collaborate down the road.

Keep creating great stuff!

{sender}`,
];

const FOLLOWUP_TEMPLATES = [
  `Hey! Just following up on my previous email about a potential collaboration.

Would love to hear your thoughts when you get a chance!

Best,
{sender}`,
  `Hi there! Wanted to bump this up in your inbox.

Let me know if you're interested in discussing a partnership!

Cheers,
{sender}`,
];

const fill = (tpl: string, vars: Record<string, string | number>) =>
  tpl.replace(/\{(\w+)\}/g, (_, k) => String(vars[k] ?? ""));

export function renderNegotiation(offer: number, sender: string): string {
  return fill(pick(NEGOTIATION_TEMPLATES), {
    offer: Math.round(offer),
    extra: pick(COUNTER_EXTRAS),
    sender,
  });
}
export function renderAcceptance(amount: number, sender: string): string {
  return fill(pick(ACCEPTANCE_TEMPLATES), { amount: Math.round(amount), sender });
}
export function renderFinalOffer(offer: number, sender: string): string {
  return fill(pick(FINAL_OFFER_TEMPLATES), { offer: Math.round(offer), sender });
}
export function renderGoodbye(sender: string): string {
  return fill(pick(GOODBYE_TEMPLATES), { sender });
}
export function renderFollowup(sender: string): string {
  return fill(pick(FOLLOWUP_TEMPLATES), { sender });
}
export function renderDeclineOverBudget(ask: number, maxOffer: number, sender: string): string {
  return `Thanks for sharing your rates!

Unfortunately $${Math.round(ask)} is outside our budget for this campaign (max $${Math.round(
    maxOffer
  )}).

If you're ever open to collaborating at a lower rate, we'd love to work together. Best of luck with your content!

${sender}`;
}
