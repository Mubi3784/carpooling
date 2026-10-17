export const VEHICLE_TYPES = ['CAR', 'BIKE'];

// Missing/unknown values (old rides) are treated as CAR
export const normalizeVehicleType = (value) => (value === 'BIKE' ? 'BIKE' : 'CAR');

export const getVehicleLabel = (type) => (normalizeVehicleType(type) === 'BIKE' ? 'Bike' : 'Car');

// Highest seat count a driver can set: bikes carry 1, cars up to their own capacity
export const getMaxSeats = (ride) => {
  if (normalizeVehicleType(ride?.vehicleType) === 'BIKE') return 1;
  const total = Number(ride?.totalSeats);
  return Number.isInteger(total) && total >= 1 && total <= 6 ? total : 6;
};
