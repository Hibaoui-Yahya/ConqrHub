import { UnstyledButton, Group, Text, Menu } from "@mantine/core";

/**
 * @conqr/shell — shared shell primitives (blueprint §7.4). Gives both products a
 * stable frame: a product switcher and a clear active-product identity, so a
 * user always knows whether they're in knowledge (Hub) or execution (Plane).
 */

export type ConqrProductId = "hub" | "plane";

export interface ConqrProductLink {
  id: ConqrProductId;
  label: string;
  href: string;
}

/** Active-product badge — "consistent does not mean indistinguishable" (§7.3). */
export function ProductIdentity({ product }: { product: ConqrProductId }) {
  const label = product === "hub" ? "Hub" : "Plane";
  return (
    <Group gap={6} wrap="nowrap">
      <Text fw={700} c="var(--txt-primary)" style={{ letterSpacing: "-0.02em" }}>
        Conqr
        <span style={{ color: "var(--brand-default)" }}>{label}</span>
      </Text>
    </Group>
  );
}

/** Product switcher preserving cross-product context where a mapping exists. */
export function ProductSwitcher({
  current,
  products,
  onSwitch,
}: {
  current: ConqrProductId;
  products: ConqrProductLink[];
  onSwitch?: (p: ConqrProductLink) => void;
}) {
  return (
    <Menu position="bottom-start" width={200}>
      <Menu.Target>
        <UnstyledButton aria-label="Switch product">
          <ProductIdentity product={current} />
        </UnstyledButton>
      </Menu.Target>
      <Menu.Dropdown
        style={{
          background: "var(--bg-surface-1)",
          borderColor: "var(--border-subtle)",
        }}
      >
        <Menu.Label>Switch product</Menu.Label>
        {products.map((p) => (
          <Menu.Item
            key={p.id}
            component="a"
            href={p.href}
            onClick={() => onSwitch?.(p)}
            style={{
              color:
                p.id === current
                  ? "var(--txt-accent-primary)"
                  : "var(--txt-primary)",
            }}
          >
            Conqr{p.id === "hub" ? "Hub" : "Plane"}
          </Menu.Item>
        ))}
      </Menu.Dropdown>
    </Menu>
  );
}
