// Development diagnostics only; disabled until the PoC explicitly enables them.
let is_Enabled = false;
let trace_Number = 0;
let relay_Function = null;
let console_Function = message => console.log(message);
let relay_Queue = Promise.resolve();
const section_References = new WeakMap();

/** Configures optional sinks without introducing a business transport. */
export function configure_Trace({ enabled = false, relay = null, output = message => console.log(message) } = {}) {
    is_Enabled = enabled;
    relay_Function = relay;
    console_Function = output;
}

/** Copies only JSON data and structures, omitting runtime and circular references. */
export function snapshot_Trace_Data(value, seen = new WeakSet(), depth = 0) {
    if (value === null || ['string', 'number', 'boolean'].includes(typeof value)) return value;
    if (typeof value !== 'object' || depth > 8) return undefined;
    if (seen.has(value)) return '[circular reference omitted]';
    if (value.nodeType || ArrayBuffer.isView(value) || value instanceof ArrayBuffer) return '[runtime object omitted]';
    const type_Name = value.constructor?.name;
    if (!Array.isArray(value) && type_Name !== 'Object' && !type_Name?.startsWith('ST_')) return '[runtime object omitted]';
    seen.add(value);
    const copy = Array.isArray(value) ? [] : {};
    for (const [key, entry] of Object.entries(value)) {
        const copied_Entry = snapshot_Trace_Data(entry, seen, depth + 1);
        if (copied_Entry !== undefined) copy[key] = copied_Entry;
    }
    seen.delete(value);
    return copy;
}

/** Emits a numbered snapshot and queues the Rust relay without blocking callers. */
export function trace_Execution(className, methodName, eventName, sectionId = null, data = {}) {
    if (!is_Enabled) return;
    try {
        const record = {
            sequence: ++trace_Number, timestamp: new Date().toISOString(),
            className, methodName, event: eventName, sectionId,
            data: snapshot_Trace_Data(data)
        };
        const message = `[TRACE ${String(record.sequence).padStart(3, '0')}] ${record.timestamp} ${className}.${methodName} ${eventName} sectionId=${sectionId ?? '-'}\n${JSON.stringify(record.data, null, 2)}`;
        try { console_Function(message); } catch { /* Diagnostics never interrupt application code. */ }
        const relay = relay_Function;
        if (relay) {
            relay_Queue = relay_Queue.then(() => relay(message)).catch(relay_Error => {
                try { console_Function('[TRACE RELAY ERROR] ' + String(relay_Error)); } catch { /* Ignore sink failures. */ }
            });
        }
        return record;
    } catch { /* Serialization failures must not affect rendering. */ }
}

/** Retains diagnostic identity even after the View has detached its container. */
export function trace_Instance(clsSource, className, methodName, eventName, data = {}, sectionId) {
    try {
        const section_Id = sectionId ?? clsSource.sectionId
            ?? clsSource.contentContainer?.closest?.('[data-section-id]')?.dataset.sectionId
            ?? section_References.get(clsSource) ?? null;
        if (section_Id !== null) section_References.set(clsSource, section_Id);
        return trace_Execution(className, methodName, eventName, section_Id, data);
    } catch { /* Identity lookup is diagnostic only. */ }
}

/** Allows tests to await delivery without delaying command processing. */
export function flush_Trace_Queue() {
    return relay_Queue;
}
