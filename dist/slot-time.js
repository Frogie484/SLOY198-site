const timeToMinutes = (time) => {
  const [hours, minutes] = time.split(":").map(Number);
  return hours * 60 + minutes;
};

export const slotsOverlap = (left, right) => {
  if (left.date !== right.date) {
    return false;
  }

  const leftStart = timeToMinutes(left.time);
  const rightStart = timeToMinutes(right.time);
  const leftEnd = leftStart + Number(left.duration);
  const rightEnd = rightStart + Number(right.duration);

  return leftStart < rightEnd && leftEnd > rightStart;
};
