import assert from 'assert';

import {logger} from '../../utils/logger';
import * as Zcl from '../../zspec/zcl';
import ZclTransactionSequenceNumber from '../helpers/zclTransactionSequenceNumber';
import {DatabaseEntry, KeyValue} from '../tstype';
import Device from './device';
import Endpoint from './endpoint';
import Entity from './entity';

const NS = 'zh:controller:group';

interface Options {
    manufacturerCode?: number;
    direction?: Zcl.Direction;
    srcEndpoint?: number;
    reservedBits?: number;
    transactionSequenceNumber?: number;
}

class Group extends Entity {
    private databaseID: number;
    public readonly groupID: number;
    private readonly _members: Set<Endpoint>;
    get members(): Endpoint[] {
        return Array.from(this._members).filter((e) => e.getDevice());
    }
    // Can be used by applications to store data.
    public readonly meta: KeyValue;

    // This lookup contains all groups that are queried from the database, this is to ensure that always
    // the same instance is returned.
    private static groups: {[groupID: number]: Group} = null;

    private constructor(databaseID: number, groupID: number, members: Set<Endpoint>, meta: KeyValue) {
        super();
        this.databaseID = databaseID;
        this.groupID = groupID;
        this._members = members;
        this.meta = meta;
    }

    /*
     * CRUD
     */

    private static fromDatabaseEntry(entry: DatabaseEntry): Group {
        const members = new Set<Endpoint>();
        for (const member of entry.members) {
            const device = Device.byIeeeAddr(member.deviceIeeeAddr);
            if (device) {
                const endpoint = device.getEndpoint(member.endpointID);
                members.add(endpoint);
            }
        }

        return new Group(entry.id, entry.groupID, members, entry.meta);
    }

    public toDatabaseEntry(): DatabaseEntry {
        const members = Array.from(this.members).map((member) => {
            return {deviceIeeeAddr: member.getDevice().ieeeAddr, endpointID: member.ID};
        });

        return {id: this.databaseID, type: 'Group', groupID: this.groupID, members, meta: this.meta};
    }

    public static async loadGroups(): Promise<void> {
        if (!Group.groups) {
            logger.debug('Loading groups', NS);
            Group.groups = {};
            const entries = await Entity.database.getEntries(['Group']);
            for (const entry of entries) {
                const group = Group.fromDatabaseEntry(entry);
                Group.groups[group.groupID] = group;
            }
        }
    }

    public static byGroupID(groupID: number): Group {
        return Group.groups[groupID];
    }

    public static all(): Group[] {
        return Object.values(Group.groups);
    }

    public static async create(groupID: number): Promise<Group> {
        assert(typeof groupID === 'number', 'GroupID must be a number');
        // Don't allow groupID 0, from the spec:
        // "Scene identifier 0x00, along with group identifier 0x0000, is reserved for the global scene used by the OnOff cluster"
        assert(groupID >= 1, 'GroupID must be at least 1');
        if (Group.groups[groupID]) {
            throw new Error(`Group with groupID '${groupID}' already exists`);
        }

        const databaseID = await Entity.database.newID();
        const group = new Group(databaseID, groupID, new Set(), {});
        await Entity.database.insert(group.toDatabaseEntry());

        Group.groups[group.groupID] = group;
        return group;
    }

    public async removeFromNetwork(): Promise<void> {
        for (const endpoint of this._members) {
            await endpoint.removeFromGroup(this);
        }

        await this.removeFromDatabase();
    }

    public async removeFromDatabase(): Promise<void> {

        if (await Entity.database.has(this.databaseID)) {
            await Entity.database.remove(this.databaseID);
        }

        delete Group.groups[this.groupID];
    }

    public async save(): Promise<void> {
        await Entity.database.update(this.toDatabaseEntry());
    }

    public async addMember(endpoint: Endpoint): Promise<void> {
        this._members.add(endpoint);
        await this.save();
    }

    public async removeMember(endpoint: Endpoint): Promise<void> {
        this._members.delete(endpoint);
        await this.save();
    }

    public hasMember(endpoint: Endpoint): boolean {
        return this._members.has(endpoint);
    }

    /*
     * Zigbee functions
     */

    public async write(clusterKey: number | string, attributes: KeyValue, options?: Options): Promise<void> {
        options = this.getOptionsWithDefaults(options, Zcl.Direction.CLIENT_TO_SERVER);
        const cluster = Zcl.Utils.getCluster(clusterKey, null, {});
        const payload: {attrId: number; dataType: number; attrData: number | string | boolean}[] = [];
        for (const [nameOrID, value] of Object.entries(attributes)) {
            if (cluster.hasAttribute(nameOrID)) {
                const attribute = cluster.getAttribute(nameOrID);
                payload.push({attrId: attribute.ID, attrData: value, dataType: attribute.type});
            } else if (!isNaN(Number(nameOrID))) {
                payload.push({attrId: Number(nameOrID), attrData: value.value, dataType: value.type});
            } else {
                throw new Error(`Unknown attribute '${nameOrID}', specify either an existing attribute or a number`);
            }
        }

        const log = `Write ${this.groupID} ${cluster.name}(${JSON.stringify(attributes)}, ${JSON.stringify(options)})`;
        logger.debug(log, NS);

        try {
            const frame = Zcl.Frame.create(
                Zcl.FrameType.GLOBAL,
                options.direction,
                true,
                options.manufacturerCode,
                options.transactionSequenceNumber ?? ZclTransactionSequenceNumber.next(),
                'write',
                cluster.ID,
                payload,
                {},
                options.reservedBits,
            );
            await Entity.adapter.sendZclFrameToGroup(this.groupID, frame, options.srcEndpoint);
        } catch (error) {
            error.message = `${log} failed (${error.message})`;
            logger.debug(error, NS);
            throw error;
        }
    }

    public async read(clusterKey: number | string, attributes: (string | number)[], options?: Options): Promise<void> {
        options = this.getOptionsWithDefaults(options, Zcl.Direction.CLIENT_TO_SERVER);
        const cluster = Zcl.Utils.getCluster(clusterKey, null, {});
        const payload: {attrId: number}[] = [];
        for (const attribute of attributes) {
            payload.push({attrId: typeof attribute === 'number' ? attribute : cluster.getAttribute(attribute).ID});
        }

        const frame = Zcl.Frame.create(
            Zcl.FrameType.GLOBAL,
            options.direction,
            true,
            options.manufacturerCode,
            options.transactionSequenceNumber ?? ZclTransactionSequenceNumber.next(),
            'read',
            cluster.ID,
            payload,
            {},
            options.reservedBits,
        );

        const log = `Read ${this.groupID} ${cluster.name}(${JSON.stringify(attributes)}, ${JSON.stringify(options)})`;
        logger.debug(log, NS);

        try {
            await Entity.adapter.sendZclFrameToGroup(this.groupID, frame, options.srcEndpoint);
        } catch (error) {
            error.message = `${log} failed (${error.message})`;
            logger.debug(error, NS);
            throw error;
        }
    }

    public async command(clusterKey: number | string, commandKey: number | string, payload: KeyValue, options?: Options): Promise<void> {
        options = this.getOptionsWithDefaults(options, Zcl.Direction.CLIENT_TO_SERVER);
        const cluster = Zcl.Utils.getCluster(clusterKey, null, {});
        const command = cluster.getCommand(commandKey);

        const log = `Command ${this.groupID} ${cluster.name}.${command.name}(${JSON.stringify(payload)})`;
        logger.debug(log, NS);

        try {
            const frame = Zcl.Frame.create(
                Zcl.FrameType.SPECIFIC,
                options.direction,
                true,
                options.manufacturerCode,
                options.transactionSequenceNumber || ZclTransactionSequenceNumber.next(),
                command.ID,
                cluster.ID,
                payload,
                {},
                options.reservedBits,
            );
            await Entity.adapter.sendZclFrameToGroup(this.groupID, frame, options.srcEndpoint);
        } catch (error) {
            error.message = `${log} failed (${error.message})`;
            logger.debug(error, NS);
            throw error;
        }
    }

    private getOptionsWithDefaults(options: Options, direction: Zcl.Direction): Options {
        const providedOptions = options || {};
        return {
            direction,
            srcEndpoint: null,
            reservedBits: 0,
            manufacturerCode: null,
            transactionSequenceNumber: null,
            ...providedOptions,
        };
    }
}

export default Group;
