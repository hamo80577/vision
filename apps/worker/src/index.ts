export function getWorkerStatus() {
  return {
    service: "vision-worker",
    status: "idle"
  } as const;
}

console.log(JSON.stringify(getWorkerStatus()));
