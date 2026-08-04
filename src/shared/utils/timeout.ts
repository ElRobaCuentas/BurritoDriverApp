// Primitivas puras de control de tiempo. No conocen React, Firebase,
// estados ni UI. Compartidas por SendCoordinates (C4.3) y admin_check
// (C4.AUTH). La orquestación de reintentos NO vive aquí: cada flujo la
// gestiona según su capa (bucle en el componente vs efecto React).
export const withTimeout = <T>(promise: Promise<T>, ms: number): Promise<T> =>
  new Promise<T>((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error('timeout consultando Firebase')),
      ms,
    );
    promise.then(
      value => {
        clearTimeout(timer);
        resolve(value);
      },
      error => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });

export const pause = (ms: number) =>
  new Promise<void>(resolve => setTimeout(resolve, ms));
