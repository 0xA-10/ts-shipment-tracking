export { reverseOneToManyDictionary } from "tycelium";

export const getLocation = ({
  city,
  country,
  state,
  zip,
}: {
  city?: string;
  state?: string;
  country?: string;
  zip?: string;
}) => [city, state, country, zip].filter(Boolean).join(" ") || undefined;

// source: https://github.com/joonhocho/tsdef/blob/4f0a9f07c5ac704604afeb64f52de3fc7709989c/src/index.ts#L222C1-L226C3
export type DeepPartial<T> = {
  [P in keyof T]?: T[P] extends Array<infer I> ? Array<DeepPartial<I>> : DeepPartial<T[P]>;
};
