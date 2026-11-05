"use client";

import { useRouter } from "next/navigation";
import * as React from "react";
import { Money } from "@/components/domain/Money";
import { Field, FormStatus } from "@/components/form/Field";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DEVICE_CATEGORIES, PLAYER_PRICED_CATEGORIES } from "@/features/devices/schemas";
import { useI18n } from "@/lib/i18n/client";
import { tpl } from "@/lib/i18n/messages";
import { minorToInput } from "@/lib/money";
import { deleteRateAction, setRateAction } from "../actions";
import type { PricingRule } from "../queries";

type Msg = { ok: boolean; message: string } | null;
const selectCls =
  "h-11 w-full rounded-xl border border-border bg-surface px-3.5 text-base sm:h-10 sm:text-sm";

export function PricingEditor({
  hallId,
  currency,
  rules,
}: {
  hallId: string;
  currency: string;
  rules: PricingRule[];
}) {
  const { t } = useI18n();
  const router = useRouter();
  const [scope, setScope] = React.useState<"hall" | "category">("category");
  const [category, setCategory] = React.useState<string>(DEVICE_CATEGORIES[0]);
  const [rate, setRate] = React.useState("");
  const [players, setPlayers] = React.useState<"" | "2" | "4">("");
  const [msg, setMsg] = React.useState<Msg>(null);
  const [pending, setPending] = React.useState(false);

  // Only kinds played by 2 or 4 people can have a rate per player count (not PCs).
  const playerPriced = scope === "category" && PLAYER_PRICED_CATEGORIES.includes(category);

  async function saveRate(e: React.FormEvent) {
    e.preventDefault();
    setPending(true);
    const r = await setRateAction(hallId, {
      scope,
      deviceId: null,
      category: scope === "category" ? category : null,
      rateText: rate,
      playersCount: playerPriced && players ? (Number(players) as 2 | 4) : null,
    });
    setPending(false);
    setMsg(
      r.ok
        ? { ok: true, message: t.pcRateSaved }
        : { ok: false, message: r.fieldErrors ? Object.values(r.fieldErrors)[0]! : r.message },
    );
    if (r.ok) {
      setRate("");
      router.refresh();
    }
  }

  const label = (r: PricingRule) => {
    const base =
      r.scope === "hall"
        ? t.pcScopeHall
        : r.scope === "category"
          ? tpl(t.pcLblCategory, { name: r.category ?? "" })
          : tpl(t.pcLblDevice, { name: r.deviceName ?? "" });
    return r.playersCount ? tpl(t.pcLblPlayers, { base, n: r.playersCount }) : base;
  };

  return (
    <div className="space-y-8">
      <section aria-labelledby="rates-h">
        <h2 id="rates-h" className="mb-2 text-lg font-medium">
          {tpl(t.pcRatesTitle, { cur: currency })}
        </h2>
        {rules.length === 0 ? (
          <p className="text-sm text-muted">{t.pcNoRates}</p>
        ) : (
          <ul className="divide-y divide-border rounded-2xl border border-border bg-surface shadow-card text-sm">
            {rules.map((r) => (
              <li key={r.id} className="flex items-center justify-between gap-3 p-3">
                <span>{label(r)}</span>
                <span className="flex items-center gap-3">
                  <span className="tabular-nums">
                    <Money minor={r.ratePerHourMinor} currency={currency} /> {t.pcPerHour}
                  </span>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={async () => {
                      const res = await deleteRateAction(hallId, r.id);
                      setMsg(
                        res.ok
                          ? { ok: true, message: t.pcRateRemoved }
                          : { ok: false, message: res.message },
                      );
                      if (res.ok) router.refresh();
                    }}
                  >
                    {t.pcRemove}
                  </Button>
                </span>
              </li>
            ))}
          </ul>
        )}

        <form onSubmit={saveRate} className="mt-4 grid max-w-xl gap-3" noValidate>
          <Field id="pr-scope" label={t.pcAppliesTo}>
            {(p) => (
              <select
                {...p}
                className={selectCls}
                value={scope}
                onChange={(e) => setScope(e.target.value as typeof scope)}
              >
                <option value="category">{t.pcScopeCategory}</option>
                <option value="hall">{t.pcScopeHall}</option>
              </select>
            )}
          </Field>
          {scope === "category" && (
            <Field id="pr-cat" label={t.pcCategory} hint={t.pcCategoryHint}>
              {(p) => (
                <select
                  {...p}
                  className={selectCls}
                  value={category}
                  onChange={(e) => {
                    setCategory(e.target.value);
                    if (!PLAYER_PRICED_CATEGORIES.includes(e.target.value)) setPlayers("");
                  }}
                >
                  {[
                    ...new Set([
                      ...DEVICE_CATEGORIES,
                      ...rules.map((r) => r.category).filter((c): c is string => !!c),
                    ]),
                  ].map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              )}
            </Field>
          )}
          {playerPriced && (
            <Field id="pr-players" label={t.players} hint={t.pcPlayersHint}>
              {(p) => (
                <select
                  {...p}
                  className={selectCls}
                  value={players}
                  onChange={(e) => setPlayers(e.target.value as typeof players)}
                >
                  <option value="">{t.pcAny}</option>
                  <option value="2">{tpl(t.rsPlayersN, { n: 2 })}</option>
                  <option value="4">{tpl(t.rsPlayersN, { n: 4 })}</option>
                </select>
              )}
            </Field>
          )}
          <Field
            id="pr-rate"
            label={tpl(t.pcRateLabel, { cur: currency })}
            hint={
              rules[0]
                ? tpl(t.pcExample, { v: minorToInput(rules[0].ratePerHourMinor, currency) })
                : undefined
            }
          >
            {(p) => (
              <Input
                {...p}
                inputMode="decimal"
                value={rate}
                onChange={(e) => setRate(e.target.value)}
              />
            )}
          </Field>
          <div>
            <Button type="submit" pending={pending}>
              {t.pcSaveRate}
            </Button>
          </div>
        </form>
      </section>

      <FormStatus state={msg} />
    </div>
  );
}
