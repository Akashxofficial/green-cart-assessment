// backend/controllers/simulationController.js  (patched)
const Driver = require('../models/Driver');
const Order = require('../models/Order');
const RouteModel = require('../models/Route');
const SimulationResult = require('../models/SimulationResult');

function toNum(v) {
  if (v === undefined || v === null) return NaN;
  if (typeof v === 'number') return v;
  const n = Number(v);
  return Number.isFinite(n) ? n : NaN;
}
function minutesFromHHMM(str) {
  if (!str || typeof str !== 'string') return null;
  const parts = str.split(':').map(s => s.trim());
  if (parts.length !== 2) return null;
  const hh = Number(parts[0]), mm = Number(parts[1]);
  if (!Number.isFinite(hh) || !Number.isFinite(mm)) return null;
  return hh * 60 + mm;
}
function normalizeRoute(r) {
  if (!r) return null;
  return {
    routeId: r.routeId ?? r.route_id ?? (r._id && String(r._id)),
    distanceKm: toNum(r.distanceKm ?? r.distance_km ?? 0),
    trafficLevel: String(r.trafficLevel ?? r.traffic_level ?? ''),
    baseTimeMinutes: toNum(r.baseTimeMinutes ?? r.base_time_min ?? r.base_time_minutes ?? 0)
  };
}

async function resolveRouteForOrder(ord, maps) {
  if (!ord.assignedRoute) return null;
  if (typeof ord.assignedRoute === 'object' && (ord.assignedRoute.routeId || ord.assignedRoute._id)) return ord.assignedRoute;
  const key = String(ord.assignedRoute);
  return maps.byRouteId[key] || maps.byObjId[key] || null;
}

module.exports.runSimulation = async (req, res) => {
  try {
    // Parse inputs (support multiple field names)
    const numRaw = req.body.numberOfDrivers ?? req.body.numDrivers ?? req.body.number;
    const numberOfDrivers = Math.floor(toNum(numRaw));
    const routeStartTime = req.body.routeStartTime ?? req.body.route_start_time ?? req.body.startTime;
    const maxHoursPerDriver = toNum(req.body.maxHoursPerDriver ?? req.body.max_hours_per_driver ?? req.body.maxHours);

    // Optional flags
    const allowOvertimePercent = Math.max(0, toNum(req.body.allowOvertimePercent ?? req.body.allow_overtime_percent ?? 0) || 0);
    const allowSplitOrders = Boolean(req.body.allowSplitOrders ?? req.body.allow_split_orders ?? false);

    const startMinutes = minutesFromHHMM(routeStartTime);

    const errors = {};
    if (!Number.isFinite(numberOfDrivers) || numberOfDrivers <= 0) errors.numberOfDrivers = 'must be positive integer';
    if (startMinutes === null) errors.routeStartTime = 'must be HH:MM';
    if (!Number.isFinite(maxHoursPerDriver) || maxHoursPerDriver <= 0) errors.maxHoursPerDriver = 'must be positive number';
    if (Object.keys(errors).length) return res.status(400).json({ error: 'invalid_input', details: errors });

    console.log('SIM INPUT:', { numberOfDrivers, routeStartTime, maxHoursPerDriver, allowOvertimePercent, allowSplitOrders });

    // Fetch drivers & prepare driver state (respect available count)
    const allDrivers = await Driver.find().lean();
    if (!allDrivers.length) return res.status(400).json({ error: 'no_drivers' });
    const useDriversCount = Math.min(numberOfDrivers, allDrivers.length);
    const drivers = allDrivers.slice(0, useDriversCount);

    // Build route lookup maps (single fetch)
    const routes = await RouteModel.find().lean();
    const byRouteId = {}, byObjId = {};
    for (const r of routes) {
      if (r.routeId) byRouteId[String(r.routeId)] = r;
      if (r._id) byObjId[String(r._id)] = r;
    }

    // Fetch orders (populate assignedRoute if possible) - only pending/new/unassigned
    const ordersRaw = await Order.find({ status: { $in: ['pending', 'new', 'unassigned'] } }).populate('assignedRoute').lean();

    // Prepare per-driver runtime state:
    const driverState = drivers.map(d => {
      const currentShift = toNum(d.currentShiftHours ?? d.current_shift_hours ?? d.shift_hours ?? 0);
      const dbRemainingCandidate = toNum(d.remainingHours ?? d.remaining_hours ?? NaN);
      const dbRemaining = Number.isFinite(dbRemainingCandidate)
        ? dbRemainingCandidate
        : Math.max(0, maxHoursPerDriver - currentShift);
      const remainingHours = Math.max(0, Math.min(dbRemaining, maxHoursPerDriver));
      const yesterdayHoursCandidate = Array.isArray(d.past7DayHours) && d.past7DayHours.length
        ? toNum(d.past7DayHours[0])
        : (Array.isArray(d.past7DaysHours) && d.past7DaysHours.length ? toNum(d.past7DaysHours[0]) : toNum((d.past_week_hours && typeof d.past_week_hours === 'string') ? d.past_week_hours.split('|')[0] : NaN));
      const yesterdayHours = Number.isFinite(yesterdayHoursCandidate) ? yesterdayHoursCandidate : 0;
      const fatigued = yesterdayHours > 8;
      const speedMultiplier = fatigued ? 0.7 : 1;
      return {
        id: String(d._id),
        name: d.name,
        raw: d,
        remainingHours,
        currentShiftHours: currentShift,
        speedMultiplier,
        assignedOrders: [],
        used: false
      };
    });

    // Normalize orders (and sort)
    const orders = ordersRaw.map(o => {
      const pickupMin = o.pickupTime ? minutesFromHHMM(o.pickupTime) : (o.startTime ? minutesFromHHMM(o.startTime) : null);
      const deadlineMin = o.deadlineTime ? minutesFromHHMM(o.deadlineTime) : null;
      let durationMin = 0;
      if (o.durationMinutes) durationMin = Number(o.durationMinutes) || 0;
      else if (o.durationHours) durationMin = (Number(o.durationHours) || 0) * 60;
      else if (o.estimatedMinutes) durationMin = Number(o.estimatedMinutes) || 0;
      return {
        raw: o,
        id: o.orderId ?? o.order_id ?? String(o._id),
        pickupMin,
        deadlineMin,
        durationMin: Math.max(0, durationMin)
      };
    });

    orders.sort((a, b) => {
      if (a.pickupMin != null && b.pickupMin != null) return a.pickupMin - b.pickupMin;
      if (a.deadlineMin != null && b.deadlineMin != null) return a.deadlineMin - b.deadlineMin;
      return (a.id || '').localeCompare(b.id || '');
    });

    // Helpers
    function minutesAvailableWithOvertime(driver) {
      const baseHours = Number(driver.remainingHours || 0);
      const capped = baseHours * (1 + allowOvertimePercent / 100);
      return Math.max(0, Math.floor(capped * 60));
    }
    function hoursFromMinutes(mins) { return +(mins / 60); }
    function round2(x) { return Math.round(x * 100) / 100; }

    let candidateDrivers = driverState.slice(0);

    let totalProfit = 0, onTimeCount = 0, lateCount = 0, unassignedCount = 0;
    const orderDetails = [];
    const assignments = {};

    // Assignment loop
    for (const ord of orders) {
      const route = await resolveRouteForOrder(ord.raw, { byRouteId, byObjId });
      if (!route) {
        assignments[ord.id] = { assignedTo: [], reason: 'unresolved_route' };
        orderDetails.push({ orderId: ord.id, driver: null, routeId: null, trafficLevel: null, isLate: true, penalty: 0, fuelCost: 0, bonus: 0, orderProfit: 0, deliveryTimeMinutes: 0 });
        continue;
      }
      const nr = normalizeRoute(route);
      // Use order.durationMin if present, otherwise fall back to route base time
      const usedDurationMin = (ord.durationMin && ord.durationMin > 0) ? ord.durationMin : (nr.baseTimeMinutes || 0);

      assignments[ord.id] = { assignedTo: [], reason: null };

      // single-driver attempt
      const capable = candidateDrivers
        .filter(d => minutesAvailableWithOvertime(d) >= usedDurationMin && d.remainingHours > 0)
        .sort((a, b) => {
          if ((a.used ? 1 : 0) !== (b.used ? 1 : 0)) return (b.used ? 1 : 0) - (a.used ? 1 : 0);
          return b.remainingHours - a.remainingHours;
        });

      let chosen = null;
      const currentlyUsedCount = candidateDrivers.filter(d => d.used).length;
      for (const d of capable) {
        if (!d.used && currentlyUsedCount >= Math.min(numberOfDrivers, candidateDrivers.length)) continue;
        chosen = d;
        break;
      }

      if (chosen) {
        const driverDeliveryMin = (nr.baseTimeMinutes || 0) / (chosen.speedMultiplier || 1); // delivery time depends on route base time & speedMultiplier
        const requiredHours = driverDeliveryMin / 60;
        chosen.remainingHours = Math.max(0, chosen.remainingHours - requiredHours);
        chosen.assignedOrders.push(ord.raw);
        if (!chosen.used) chosen.used = true;
        assignments[ord.id].assignedTo.push({ driverId: chosen.id, driverName: chosen.name, minutes: Math.round(driverDeliveryMin) });

        const allowed = (nr.baseTimeMinutes || 0) + 10;
        const isLate = driverDeliveryMin > allowed;
        const penalty = isLate ? 50 : 0;
        let fuelCost = (nr.distanceKm || 0) * 5;
        if ((nr.trafficLevel || '').toLowerCase() === 'high') fuelCost += (nr.distanceKm || 0) * 2;
        const valueRs = toNum(ord.raw.valueRs ?? ord.raw.value_rs ?? 0);
        const bonus = (valueRs > 1000 && !isLate) ? (valueRs * 0.10) : 0;
        const orderProfit = valueRs + bonus - penalty - fuelCost;

        totalProfit += orderProfit;
        if (isLate) lateCount++; else onTimeCount++;

        orderDetails.push({
          orderId: ord.id,
          driver: chosen.name,
          routeId: nr.routeId,
          trafficLevel: nr.trafficLevel,
          isLate,
          penalty: round2(penalty),
          fuelCost: round2(fuelCost),
          bonus: round2(bonus),
          orderProfit: round2(orderProfit),
          deliveryTimeMinutes: round2(driverDeliveryMin)
        });

        candidateDrivers.sort((a, b) => b.remainingHours - a.remainingHours);
        continue;
      }

      // splitting logic (if enabled)
      if (allowSplitOrders) {
        let remainingMins = usedDurationMin;
        const pool = candidateDrivers
          .filter(d => minutesAvailableWithOvertime(d) > 0)
          .sort((a, b) => {
            if ((a.used ? 1 : 0) !== (b.used ? 1 : 0)) return (b.used ? 1 : 0) - (a.used ? 1 : 0);
            return b.remainingHours - a.remainingHours;
          });

        for (const d of pool) {
          if (remainingMins <= 0) break;
          const avail = minutesAvailableWithOvertime(d);
          if (avail <= 0) continue;
          const currentlyUsed = candidateDrivers.filter(x => x.used).length;
          if (!d.used && currentlyUsed >= Math.min(numberOfDrivers, candidateDrivers.length)) continue;

          const take = Math.min(avail, remainingMins);
          const takeHours = hoursFromMinutes(take);
          d.remainingHours = Math.max(0, d.remainingHours - takeHours);
          d.assignedOrders.push(ord.raw);
          if (!d.used) d.used = true;
          assignments[ord.id].assignedTo.push({ driverId: d.id, driverName: d.name, minutes: Math.round(take) });
          remainingMins -= take;

          candidateDrivers.sort((a, b) => b.remainingHours - a.remainingHours);
        }

        if (remainingMins <= 0) {
          const isLate = (ord.deadlineMin != null && ord.pickupMin != null) ? (ord.pickupMin > ord.deadlineMin) : false;
          if (isLate) lateCount++; else onTimeCount++;

          const penalty = isLate ? 50 : 0;
          let fuelCost = (nr.distanceKm || 0) * 5;
          if ((nr.trafficLevel || '').toLowerCase() === 'high') fuelCost += (nr.distanceKm || 0) * 2;
          const valueRs = toNum(ord.raw.valueRs ?? ord.raw.value_rs ?? 0);
          const bonus = (valueRs > 1000 && !isLate) ? (valueRs * 0.10) : 0;
          const orderProfit = valueRs + bonus - penalty - fuelCost;
          totalProfit += orderProfit;

          orderDetails.push({
            orderId: ord.id,
            driver: assignments[ord.id].assignedTo.map(a => a.driverName).join(', '),
            routeId: nr.routeId,
            trafficLevel: nr.trafficLevel,
            isLate,
            penalty: round2(penalty),
            fuelCost: round2(fuelCost),
            bonus: round2(bonus),
            orderProfit: round2(orderProfit),
            deliveryTimeMinutes: round2(nr.baseTimeMinutes || 0)
          });

          continue;
        }
      }

      // Could not assign
      unassignedCount++;
      assignments[ord.id].reason = 'no_capacity';
      lateCount++;
      orderDetails.push({
        orderId: ord.id,
        driver: null,
        routeId: nr.routeId,
        trafficLevel: nr.trafficLevel,
        isLate: true,
        penalty: 50,
        fuelCost: Math.round(((nr.distanceKm || 0) * 5 + ((nr.trafficLevel || '').toLowerCase() === 'high' ? (nr.distanceKm || 0) * 2 : 0)) * 100) / 100,
        bonus: 0,
        orderProfit: 0,
        deliveryTimeMinutes: Math.round((nr.baseTimeMinutes || 0) * 100) / 100
      });

      // Better log: stringify availabilities
      const availArr = candidateDrivers.map(d => ({ id: d.id, availMin: minutesAvailableWithOvertime(d), remainingHours: d.remainingHours }));
      console.log(`Order ${ord.id} unassigned — needed ${usedDurationMin}m, avail: ${JSON.stringify(availArr)}`);
    }

    const usedDrivers = driverState.filter(d => d.assignedOrders.length > 0).length;
    const totalDeliveries = onTimeCount + lateCount;
    const efficiency = totalDeliveries === 0 ? 0 : (onTimeCount / totalDeliveries) * 100;

    const result = {
      totalProfit: Math.round(totalProfit * 100) / 100,
      efficiency: Math.round(efficiency * 100) / 100,
      onTime: onTimeCount,
      late: lateCount,
      totalDeliveries,
      orderDetails,
      assignments,
      meta: {
        requestedDrivers: numberOfDrivers,
        availableDrivers: allDrivers.length,
        usedDrivers,
        unassignedOrdersCount: unassignedCount,
        unresolvedOrdersCount: 0,
        perDriver: driverState.map(d => ({ id: d.id, name: d.name, remainingHours: Math.round(d.remainingHours * 100) / 100, assignedCount: d.assignedOrders.length }))
      }
    };

    try { await SimulationResult.create({ input: req.body, result }); } catch (e) { console.warn('save simulation failed', e.message); }

    console.log('SIM SUMMARY:', result.meta, 'onTime', result.onTime, 'late', result.late);
    return res.json(result);
  } catch (err) {
    console.error('simulation error', err);
    return res.status(500).json({ error: 'internal_error', details: err.message });
  }

  // helper used inside split code
  function hoursFromMinutes(mins) { return +(mins / 60); }
};
