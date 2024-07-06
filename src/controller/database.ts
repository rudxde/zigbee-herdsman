import * as fs from 'fs';
import {readFile} from 'fs/promises';
import {logger} from '../utils/logger';
import {DatabaseEntry, EntityType, IDatabase} from './tstype';

const NS = 'zh:controller:database';

class Database implements IDatabase {
    private entries: {[id: number]: DatabaseEntry};
    private path: string;
    private maxId: number;

    private constructor(entries: {[id: number]: DatabaseEntry}, path: string) {
        this.entries = entries;
        this.maxId = Math.max(...Object.keys(entries).map((t) => Number(t)), 0);
        this.path = path;
    }

    public static async open(path: string): Promise<Database> {
        const entries: {[id: number]: DatabaseEntry} = {};

        if (fs.existsSync(path)) {
            const dbFile = await readFile(path, 'utf-8');
            const rows = dbFile.split('\n').map((r) => r.trim()).filter((r) => r != '');
            for (const row of rows) {
                const json = JSON.parse(row);
                if (json.hasOwnProperty('id')) {
                    entries[json.id] = json;
                }
            }
        }

        return new Database(entries, path);
    }

    public async getEntries(type: EntityType[]): Promise<DatabaseEntry[]> {
        return Object.values(this.entries).filter((e) => type.includes(e.type));
    }

    public async insert(DatabaseEntry: DatabaseEntry): Promise<void> {
        if (this.entries[DatabaseEntry.id]) {
            throw new Error(`DatabaseEntry with ID '${DatabaseEntry.id}' already exists`);
        }

        this.entries[DatabaseEntry.id] = DatabaseEntry;
        await this.write();
    }

    public async update(DatabaseEntry: DatabaseEntry): Promise<void> {
        if (!this.entries[DatabaseEntry.id]) {
            throw new Error(`DatabaseEntry with ID '${DatabaseEntry.id}' does not exist`);
        }

        this.entries[DatabaseEntry.id] = DatabaseEntry;

        await this.write();
    }

    public async updateMany(databaseEntries: DatabaseEntry[]): Promise<void> {
        for (const databaseEntry of databaseEntries) {
            if (!this.entries[databaseEntry.id]) {
                throw new Error(`DatabaseEntry with ID '${databaseEntry.id}' does not exist`);
            }
            this.entries[databaseEntry.id] = databaseEntry;
        }
        await this.write();
    }

    public async remove(ID: number): Promise<void> {
        if (!this.entries[ID]) {
            throw new Error(`DatabaseEntry with ID '${ID}' does not exist`);
        }

        delete this.entries[ID];
        await this.write();
    }

    public async has(ID: number): Promise<boolean> {
        return this.entries.hasOwnProperty(ID);
    }

    public async newID(): Promise<number> {
        this.maxId += 1;
        return this.maxId;
    }

    public async subscribeDeviceUpdates(): Promise<void> {
        // The update is only required for distributed setups.
        return;
    }

    private async write(): Promise<void> {
        logger.debug(`Writing database to '${this.path}'`, NS);
        const lines = [];
        for (const DatabaseEntry of Object.values(this.entries)) {
            const json = JSON.stringify(DatabaseEntry);
            lines.push(json);
        }
        const tmpPath = this.path + '.tmp';
        fs.writeFileSync(tmpPath, lines.join('\n'));
        // Ensure file is on disk https://github.com/Koenkk/zigbee2mqtt/issues/11759
        const fd = fs.openSync(tmpPath, 'r+');
        fs.fsyncSync(fd);
        fs.closeSync(fd);
        fs.renameSync(tmpPath, this.path);
    }
}

export default Database;
