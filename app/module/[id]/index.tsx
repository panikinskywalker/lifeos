import React from "react";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useLive, useOS } from "@ui/hooks";
import { tintForModule } from "@ui/theme/moduleTint";
import { EmptyState, RowItem, RowList, Screen, Section } from "@ui/kit";
import { OverviewBlocks } from "@ui/components/OverviewBlocks";
import { HealthHome } from "../../../src/screens/HealthHome";

/** A module's page: its dashboard (numbers, charts, what needs you), then every record type with a count. */
export default function ModuleRoute() {
  const os = useOS();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const counts = useLive((o) => o.entities.countsByType(), []);
  const m = os.registry.modules.get(id ?? "");
  const overview = useLive(
    (o) => o.registry.overviewFor(id ?? "")?.(o) ?? null,
    [id],
  );
  const back = () =>
    router.canGoBack() ? router.back() : router.replace("/browse");
  if (!m) {
    return (
      <Screen title="Not found" onBack={back}>
        <EmptyState icon="box" line="That module isn’t installed." />
      </Screen>
    );
  }
  // Health is its metrics, one section each — not a list of record types.
  if (m.id === "health") return <HealthHome />;
  const tint = tintForModule(m.id);
  const types = os.registry.typesForModule(m.id).filter((x) => !x.hidden);
  const hasHome = m.screens?.some((s) => s.key === "index");
  const total = types.reduce((n, ty) => n + (counts[ty.type] ?? 0), 0);
  return (
    <Screen
      title={m.name}
      subtitle={`${total} ${total === 1 ? "record" : "records"}`}
      onBack={back}
    >
      {overview?.blocks.length ? (
        <OverviewBlocks blocks={overview.blocks} tint={tint} />
      ) : null}
      <Section title="Records">
        <RowList>
          {hasHome ? (
            <RowItem
              icon={m.icon}
              tint={tint}
              title={m.id === "finance" ? "Accounts & month" : "Board"}
              subtitle={m.description}
              onPress={() => router.push(`/module/${m.id}/index`)}
            />
          ) : null}
          {(m.screens ?? [])
            .filter((sc) => sc.key !== "index")
            .map((sc) => (
              <RowItem
                key={sc.key}
                icon={sc.key === "reports" ? "chart" : "grid"}
                tint={tint}
                title={sc.title}
                subtitle={
                  sc.key === "reports"
                    ? "Month, subscriptions run-rate, net worth"
                    : null
                }
                onPress={() =>
                  router.push(`/module/${m.id}/${sc.key}` as never)
                }
              />
            ))}
          {m.id === "automation" ? (
            <>
              <RowItem
                icon="bolt"
                tint={tint}
                title="Rules"
                subtitle="Triggers, conditions, actions"
                onPress={() => router.push("/automation")}
              />
              <RowItem
                icon="bell"
                tint={tint}
                title="Reminders"
                subtitle="Everything scheduled"
                onPress={() => router.push("/reminders")}
              />
            </>
          ) : null}
          {types.map((ty) => (
            <RowItem
              key={ty.type}
              icon={ty.icon}
              tint={tint}
              title={ty.labelPlural}
              value={String(counts[ty.type] ?? 0)}
              valueTone="secondary"
              onPress={() => router.push(`/entity/${ty.type}`)}
              chevron
            />
          ))}
        </RowList>
      </Section>
    </Screen>
  );
}
