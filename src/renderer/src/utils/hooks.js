import { useRef, useState, useEffect, useMemo } from "react";
import { debounce } from "lodash";

// Custom Hook for Debouncing from usehooks-ts
export const useUnmount = (func) => {
  const funcRef = useRef(func);

  funcRef.current = func;

  useEffect(
    () => () => {
      funcRef.current();
    },
    [],
  );
};

export const useDebounceCallback = (func, delay = 500, options) => {
  const debouncedFunc = useRef();

  useUnmount(() => {
    if (debouncedFunc.current) {
      debouncedFunc.current.cancel();
    }
  });

  const debounced = useMemo(() => {
    const debouncedFuncInstance = debounce(func, delay, options);

    const wrappedFunc = (...args) => {
      return debouncedFuncInstance(...args);
    };

    wrappedFunc.cancel = () => {
      debouncedFuncInstance.cancel();
    };

    wrappedFunc.isPending = () => {
      return !!debouncedFunc.current;
    };

    wrappedFunc.flush = () => {
      return debouncedFuncInstance.flush();
    };

    return wrappedFunc;
  }, [func, delay, options]);

  // Update the debounced function ref whenever func, wait, or options change
  useEffect(() => {
    debouncedFunc.current = debounce(func, delay, options);
  }, [func, delay, options]);

  return debounced;
};

export const useDebounceValue = (initialValue, delay, options) => {
  const eq = options?.equalityFn ?? ((left, right) => left === right);
  const unwrappedInitialValue = initialValue instanceof Function ? initialValue() : initialValue;
  const [debouncedValue, setDebouncedValue] = useState(unwrappedInitialValue);
  const previousValueRef = useRef(unwrappedInitialValue);

  const updateDebouncedValue = useDebounceCallback(setDebouncedValue, delay, options);

  // Update the debounced value if the initial value changes
  if (!eq(previousValueRef.current, unwrappedInitialValue)) {
    updateDebouncedValue(unwrappedInitialValue);
    previousValueRef.current = unwrappedInitialValue;
  }
  return [debouncedValue, updateDebouncedValue];
};
