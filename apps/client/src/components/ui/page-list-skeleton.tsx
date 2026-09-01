import { Skeleton } from "@mantine/core";

export default function PageListSkeleton() {
  return (
    <>
      {Array.from({ length: 8 }, (_, i) => (
        <Skeleton key={i} height={36} my={8} radius="md" />
      ))}
    </>
  );
}
