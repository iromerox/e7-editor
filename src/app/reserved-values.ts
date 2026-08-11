// Reading a value the device may have left in a reserved range: the editor shows nothing rather than failing on it.
import { ReservedValue } from "../protocol";

export function unlessReserved<Value>(read: () => Value): Value | undefined {
  try {
    return read();
  } catch (error) {
    if (error instanceof ReservedValue) {
      return undefined;
    }
    throw error;
  }
}
