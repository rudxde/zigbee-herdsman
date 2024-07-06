interface KeyValue {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    [s: string]: any;
}

/* Send request policies:
'bulk':             Message must be sent together with other messages in the correct sequence.
                    No immediate delivery required.
'queue':            Request shall be sent 'as-is' as soon as possible.
                    Multiple identical requests shall be delivered multiple times.
                    Not strict ordering required.
'immediate':        Request shall be sent immediately and not be kept for later retries (e.g. response message).
'keep-payload':     Request shall be sent as soon as possible.
                    If immediate delivery fails, the exact same payload is only sent once, even if there were
                    multiple requests.
'keep-command':     Request shall be sent as soon as possible.
                    If immediate delivery fails, only the latest command for each command ID is kept for delivery.
'keep-cmd-undiv':   Request shall be sent as soon as possible.
                    If immediate delivery fails, only the latest undivided set of commands is sent for each unique
                    set of command IDs.
*/
type SendPolicy = 'bulk' | 'queue' | 'immediate' | 'keep-payload' | 'keep-command' | 'keep-cmd-undiv';
type DeviceType = 'Coordinator' | 'Router' | 'EndDevice' | 'Unknown' | 'GreenPower';

type EntityType = DeviceType | 'Group';

interface DatabaseEntry {
    id: number;
    type: EntityType;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    [s: string]: any;
}

interface GreenPowerDeviceJoinedPayload {
    sourceID: number;
    deviceID: number;
    networkAddress: number;
}


interface IDatabase {
    /**
     * Get all entries of the given type
     *
     * @param {EntityType[]} type The type of entries to get
     * @return {*}  {Promise<DatabaseEntry[]>}
     */
    getEntries(type: EntityType[]): Promise<DatabaseEntry[]>;
    /**
     * Insert a new entry into the database
     *
     * @param {DatabaseEntry} DatabaseEntry The entry to insert
     * @return {Promise<void>}
     */
    insert(databaseEntry: DatabaseEntry): Promise<void>;
    /**
     * Update an existing entry in the database
     * 
     * @param DatabaseEntry The entry to update
     * @param write Whether to write the changes to disk
     */
    update(databaseEntry: DatabaseEntry): Promise<void>;
    /**
     * Update multiple entries in the database
     *
     * @param {DatabaseEntry[]} databaseEntries
     * @return {*}  {Promise<void>}
     * @memberof IDatabase
     */
    updateMany(databaseEntries: DatabaseEntry[]): Promise<void>;
    /**
     * Remove an entry from the database
     * @param id The ID of the entry to remove
     */
    remove(id: number): Promise<void>;
    /**
     * Check if an entry with the given ID exists
     *
     * @param {number} id The ID to check
     * @return {*}  {Promise<boolean>}
     */
    has(id: number): Promise<boolean>;
    /**
     * Get a new unique ID
     *
     * @return {Promise<number>}
     * @memberof IDatabase
     */
    newID(): Promise<number>;
    /**
     * 
     *
     * @param {(device: DatabaseEntry) => Promise<void>} callback
     * @memberof IDatabase
     */
    subscribeDeviceUpdates(callback: (device: DatabaseEntry) => Promise<void>): void;
}

export {
    KeyValue, DatabaseEntry, EntityType, DeviceType, GreenPowerDeviceJoinedPayload,
    SendPolicy, IDatabase
};
