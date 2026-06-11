import type { StoreContext } from "@commerce/store-context";

export type SagaStepStatus = "pending" | "tried" | "confirmed" | "cancelled" | "failed";

export type SagaStep<TInput = unknown> = {
  name: string;
  try(input: TInput, store: StoreContext): Promise<void>;
  confirm(input: TInput, store: StoreContext): Promise<void>;
  cancel(input: TInput, store: StoreContext): Promise<void>;
};

export async function runSagaStep<TInput>(
  step: SagaStep<TInput>,
  input: TInput,
  store: StoreContext
): Promise<void> {
  await step.try(input, store);
  await step.confirm(input, store);
}

export async function compensateSagaStep<TInput>(
  step: SagaStep<TInput>,
  input: TInput,
  store: StoreContext
): Promise<void> {
  await step.cancel(input, store);
}

