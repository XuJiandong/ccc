import {
  CellDep,
  CellInput,
  CellOutput,
  DepType,
  hashCkb,
  Hex,
  hexFrom,
  Num,
  numBeToBytes,
  numFrom,
  OutPoint,
  Script,
  Transaction,
} from "@ckb-ccc/core";
import {
  JsonRpcBlockHeader,
  JsonRpcCellDep,
  JsonRpcCellInput,
  JsonRpcCellOutput,
  JsonRpcTransaction,
  JsonRpcTransformers,
} from "@ckb-ccc/core/advanced";
import assert from "assert";
import {
  spawnSync,
  SpawnSyncOptionsWithBufferEncoding,
  SpawnSyncReturns,
} from "child_process";

// CellMeta defines the data structure that stores information about a Cell.
export type CellMeta = {
  outPoint: OutPoint;
  cellOutput: CellOutput;
  data: Hex;
  dataHash: Hex;
};

// MockInfoInput defines the metadata for a transaction input.
export type MockInfoInput = {
  input: JsonRpcCellInput;
  output: JsonRpcCellOutput;
  data: Hex;
};

// MockInfoCellDep defines the metadata for a Cell dependency in the transaction.
export type MockInfoCellDep = {
  cell_dep: JsonRpcCellDep;
  output: JsonRpcCellOutput;
  data: Hex;
};

// MockInfoHeaderDep defines a block header dependency.
export type MockInfoHeaderDep = JsonRpcBlockHeader;

// MockInfo is the overall structure that holds transaction metadata including
// inputs, cell dependencies, and header dependencies.
export type MockInfo = {
  inputs: MockInfoInput[];
  cell_deps: MockInfoCellDep[];
  header_deps: MockInfoHeaderDep[];
};

// TxFile defines the structure of a transaction file, containing mock
// information and the actual transaction.
export type TxFile = {
  mock_info: MockInfo;
  tx: JsonRpcTransaction;
};

/**
 * Parses the run result from the given stdout output.
 * Assumes that the desired result is located on the third-to-last line of the output,
 * in the format `Result: <value>`.
 * @param stdout - The stdout output as a string.
 * @returns The parsed integer value from the run result.
 */
export function parseRunResult(stdout: string): number {
  return parseInt(stdout.split("\n").at(-3)!.split(":")[1].slice(1));
}

/**
 * Parses the total cycle count from the given stdout output.
 * Assumes that the desired cycle information is located on the second-to-last line of the output,
 * in the format `Cycles: <value> (<details>)`.
 * @param stdout - The stdout output as a string.
 * @returns The parsed integer value representing the total cycles.
 */
export function parseAllCycles(stdout: string): number {
  return parseInt(
    stdout.split("\n").at(-2)!.split(":")[1].slice(1).split("(")[0],
  );
}

// Resource class manages CKB resources, including Cells and block headers.
export class Resource {
  cell: Map<OutPoint, CellMeta>;
  cellOutpointHash: Hex;
  cellOutpointIncr: Num;
  header: Map<Hex, MockInfoHeaderDep>;
  headerIncr: Num;
  typeidIncr: Num;

  // Constructor initializes all the resources.
  constructor() {
    this.cell = new Map();
    this.cellOutpointHash =
      "0x0000000000000000000000000000000000000000000000000000000000000000";
    this.cellOutpointIncr = numFrom(0);
    this.header = new Map();
    this.headerIncr = numFrom(0);
    this.typeidIncr = numFrom(0);
  }

  // Static method to return a default Resource instance.
  static default(): Resource {
    return new Resource();
  }

  /**
   * Creates a new Cell with specified capacity, lock script, data, and optional type.
   * @param capacity - The capacity (amount) of the Cell.
   * @param lock - The lock script to control the ownership of the Cell.
   * @param data - The data to be stored in the Cell.
   * @param type - Optional type script for the Cell.
   * @returns A CellMeta object representing the newly created Cell.
   */
  createCell(capacity: Num, lock: Script, data: Hex, type?: Script): CellMeta {
    const cellOutPoint = new OutPoint(
      this.cellOutpointHash,
      this.cellOutpointIncr,
    );
    const cellOutput = new CellOutput(capacity, lock, type);
    const cellMeta = {
      outPoint: cellOutPoint,
      cellOutput: cellOutput,
      data: data,
      dataHash: hashCkb(data),
    };
    this.cell.set(cellOutPoint, cellMeta);
    this.cellOutpointIncr += numFrom(1);
    return cellMeta;
  }

  /**
   * Creates a CellDep (Cell Dependency) for the given CellMeta.
   * @param cellMeta - The metadata of the Cell.
   * @param depType - The type of dependency (Code, DepGroup).
   * @returns A CellDep object representing the Cell dependency.
   */
  createCellDep(cellMeta: CellMeta, depType: DepType): CellDep {
    return new CellDep(cellMeta.outPoint, depType);
  }

  /**
   * Creates a CellInput for a given CellMeta.
   * @param cellMeta - The metadata of the Cell.
   * @returns A CellInput object representing the input for the transaction.
   */
  createCellInput(cellMeta: CellMeta): CellInput {
    return new CellInput(cellMeta.outPoint, numFrom(0));
  }

  /**
   * Creates a CellOutput with specified capacity, lock script, and optional type.
   * @param capacity - The capacity (amount) of the Cell.
   * @param lock - The lock script for the Cell.
   * @param type - Optional type script for the Cell.
   * @returns A CellOutput object.
   */
  createCellOutput(capacity: Num, lock: Script, type?: Script): CellOutput {
    return new CellOutput(capacity, lock, type);
  }

  /**
   * Creates a new block header dependency and returns its hash.
   * @param header - The block header to be added.
   * @returns The hash of the block header.
   */
  createHeader(header: MockInfoHeaderDep): Hex {
    header.hash = hexFrom(numBeToBytes(this.headerIncr, 32));
    this.header.set(header.hash, header);
    this.headerIncr += numFrom(1);
    return header.hash;
  }

  /**
   * Creates a Script based on data and its associated dataHash.
   * @param cellMeta - The metadata of the Cell.
   * @param args - The arguments to be used in the script.
   * @returns A Script object.
   */
  createScriptByData(cellMeta: CellMeta, args: Hex): Script {
    return new Script(cellMeta.dataHash, "data2", args);
  }

  /**
   * Creates a Script based on the type of the Cell.
   * @param cellMeta - The metadata of the Cell.
   * @param args - The arguments to be used in the script.
   * @returns A Script object.
   */
  createScriptByType(cellMeta: CellMeta, args: Hex): Script {
    return new Script(cellMeta.cellOutput.type!.hash(), "type", args);
  }

  /**
   * Creates a Script with a type ID, incrementing the type ID for each call.
   * @returns A Script object representing the type ID.
   */
  createScriptTypeID() {
    const args = hexFrom(numBeToBytes(this.typeidIncr, 32));
    this.typeidIncr += numFrom(1);
    return new Script(
      "0x00000000000000000000000000000000000000000000000000545950455f4944",
      "type",
      args,
    );
  }

  /**
   * Creates a "dummy" or unused Script.
   * @returns A Script object that is unused (typically for placeholder purposes).
   */
  createScriptUnused(): Script {
    return new Script(
      "0x0000000000000000000000000000000000000000000000000000000000000000",
      "data",
      "0x",
    );
  }

  /**
   * Deploys a new Cell with given data, using an unused lock script and zero capacity.
   * @param data - The data to be stored in the deployed Cell.
   * @returns A CellMeta object representing the deployed Cell.
   */
  deployCell(data: Hex): CellMeta {
    return this.createCell(numFrom(0), this.createScriptUnused(), data);
  }
}

// Verifier class is responsible for validating the transaction using a debugger tool.
export class Verifier {
  debugger: string; // The name of the debugger tool.
  args: string[];
  resource: Resource;
  tx: Transaction;

  constructor(resource: Resource, tx: Transaction) {
    this.debugger = "ckb-debugger";
    this.args = [];
    this.resource = resource;
    this.tx = tx;
  }

  // Static method to create a Verifier instance from a Resource and Transaction.
  static from(resource: Resource, tx: Transaction): Verifier {
    return new Verifier(resource, tx);
  }

  /**
   * Converts the transaction into a TxFile format.
   * @returns A TxFile object containing the transaction and mock information.
   */
  txfile(): TxFile {
    const r: TxFile = {
      mock_info: {
        inputs: [],
        cell_deps: [],
        header_deps: [],
      },
      tx: JsonRpcTransformers.transactionFrom(this.tx),
    };

    // Add cell dependencies to the mock info.
    for (const e of this.tx.cellDeps) {
      const cellMeta = this.resource.cell.get(e.outPoint)!;
      r.mock_info.cell_deps.push({
        cell_dep: {
          out_point: JsonRpcTransformers.outPointFrom(cellMeta.outPoint),
          dep_type: JsonRpcTransformers.depTypeFrom(e.depType),
        },
        output: JsonRpcTransformers.cellOutputFrom(cellMeta.cellOutput),
        data: cellMeta.data,
      });
    }

    // Add inputs to the mock info.
    for (const e of this.tx.inputs) {
      const cellMeta = this.resource.cell.get(e.previousOutput)!;
      r.mock_info.inputs.push({
        input: JsonRpcTransformers.cellInputFrom(e),
        output: JsonRpcTransformers.cellOutputFrom(cellMeta.cellOutput),
        data: cellMeta.data,
      });
    }

    // Add header dependencies to the mock info.
    for (const e of this.tx.headerDeps) {
      const header = this.resource.header.get(e)!;
      r.mock_info.header_deps.push(header);
    }
    return r;
  }

  /**
   * Verifies that the transaction fails the verification.
   * Asserts that the verification process identifies the failure status.
   */
  verifyFailure() {
    assert(
      this.verify().filter((e) => {
        return e.status == 0xfe;
      }).length != 0,
    );
  }

  /**
   * Verifies that the transaction is successful.
   * Asserts that no failure status is found during the verification.
   */
  verifySuccess() {
    assert(
      this.verify().filter((e) => {
        return e.status != 0x00;
      }).length == 0,
    );
  }

  /**
   * Runs the verification process on the transaction by calling the debugger tool.
   * This method spawns a new process for each input/output in the transaction and checks for errors.
   * @returns An array of results from the debugger tool (contains information about verification status).
   */
  verify(): SpawnSyncReturns<Buffer>[] {
    const txfile = JSON.stringify(this.txfile());
    const config: SpawnSyncOptionsWithBufferEncoding = {
      input: txfile,
    };
    const result: SpawnSyncReturns<Buffer>[] = [];
    for (const [i, e] of this.tx.inputs.entries()) {
      const argsLockPath = `--tx-file - --cell-type input  --script-group-type lock --cell-index ${i}`;
      const argsLock = this.args.slice().concat(argsLockPath.split(" "));
      result.push(spawnSync(this.debugger, argsLock, config));
      const cellMeta = this.resource.cell.get(e.previousOutput)!;
      if (!cellMeta.cellOutput.type) {
        continue;
      }
      const argsTypePath = `--tx-file - --cell-type input  --script-group-type type --cell-index ${i}`;
      const argsType = this.args.slice().concat(argsTypePath.split(" "));
      result.push(spawnSync(this.debugger, argsType, config));
    }
    for (const [i, e] of this.tx.outputs.entries()) {
      if (!e.type) {
        continue;
      }
      const argsTypePath = `--tx-file - --cell-type output --script-group-type type --cell-index ${i}`;
      const argsType = this.args.slice().concat(argsTypePath.split(" "));
      result.push(spawnSync(this.debugger, argsType, config));
    }
    return result;
  }
}
