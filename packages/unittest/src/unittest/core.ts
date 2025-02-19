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
 * Parses the error code from the given stdout output.
 * Assumes that the desired error code is located on the third-to-last line of the output,
 * in the format `Result: <value>`.
 * @param stdout - The stdout output as a string.
 * @returns The parsed integer value from the error code.
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

export class ScriptVerificationResult {
  constructor(
    public groupType: "lock" | "type",
    public cellType: "input" | "output",
    public index: number,
    public spawnReturn: SpawnSyncReturns<Buffer>,
  ) {}

  get status() {
    return this.spawnReturn.status;
  }

  get stdout() {
    return this.spawnReturn.stdout.toString();
  }

  get stderr() {
    return this.spawnReturn.stderr.toString();
  }

  get stdoutCycles() {
    return parseAllCycles(this.stdout);
  }

  get runResult() {
    return parseRunResult(this.stdout);
  }

  reportSummary() {
    console.log(`--------------------------------------------
${this.cellType} ${this.groupType} script at index(${this.index}):
[stdout] ${this.stdout}
[stderr] ${this.stderr}
--------------------------------------------`);
  }
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
  createCell(
    lock: Script,
    data: Hex = "0x",
    type?: Script,
    capacity: Num = numFrom(0),
  ): CellMeta {
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
  createScriptTypeID(): Script {
    const args = hexFrom(numBeToBytes(this.typeidIncr, 32));
    this.typeidIncr += numFrom(1);
    return new Script(
      "0x00000000000000000000000000000000000000000000000000545950455f4944",
      "type",
      args,
    );
  }

  /**
   * Creates a placeholder Script with a zero code hash and empty args.
   * @remarks
   * This script is intended for testing purposes only and should not be used in real transactions.
   * It is primarily used as a placeholder lock script for cell_deps where the actual script execution
   * is not needed.
   * @returns A non-executable Script object with zero code hash
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
    return this.createCell(this.createScriptUnused(), data);
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
  txFile(): TxFile {
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
   * Verifies that the transaction fails verification and optionally checks for a specific error code.
   * @param expectedErrorCode - Optional. If provided, asserts that the verification fails with this specific error code.
   * @throws {AssertionError} If expectedErrorCode is provided and the actual error code doesn't match,
   *                          or if no verification failure occurs when one is expected.
   */
  verifyFailure(expectedErrorCode?: number) {
    const runResults = this.verify();
    for (const e of runResults) {
      if (e.status != 0) {
        if (expectedErrorCode === undefined) {
          return;
        }

        if (e.runResult != expectedErrorCode) {
          console.log(
            `The expected error code is ${expectedErrorCode} but got ${e.runResult}`,
          );
          e.reportSummary();
          assert.fail(
            `Transaction verification failed not as expected. See details above.`,
          );
        } else {
          return;
        }
      }
    }
  }

  /**
   * Verifies that the transaction is successful.
   * Asserts that no failure status is found during the verification.
   */
  verifySuccess() {
    const runResults = this.verify();
    for (const e of runResults) {
      if (e.status != 0) {
        e.reportSummary();
        assert.fail("Transaction verification failed. See details above.");
      }
    }
  }

  /**
   * Runs the verification process on the transaction by calling the debugger tool.
   * This method spawns a new process for each input/output in the transaction and checks for errors.
   * @returns An array of results from the debugger tool (contains information about verification status).
   */
  verify(): ScriptVerificationResult[] {
    const txFile = JSON.stringify(this.txFile());
    const config: SpawnSyncOptionsWithBufferEncoding = {
      input: txFile,
    };
    const result: ScriptVerificationResult[] = [];
    // only run the first script in same group, according to the CKB cell model
    const lockGroup: Set<Hex> = new Set();
    const typeGroup: Set<Hex> = new Set();
    for (const [i, e] of this.tx.inputs.entries()) {
      const cellMeta = this.resource.cell.get(e.previousOutput)!;
      // skip lock script in same group
      const lockHash = cellMeta.cellOutput.lock.hash();
      if (lockGroup.has(lockHash)) {
        continue;
      }
      lockGroup.add(lockHash);

      const argsLockPath = `--tx-file - --cell-type input  --script-group-type lock --cell-index ${i}`;
      const argsLock = this.args.slice().concat(argsLockPath.split(" "));
      const result1 = spawnSync(this.debugger, argsLock, config);
      result.push(new ScriptVerificationResult("lock", "input", i, result1));

      if (!cellMeta.cellOutput.type) {
        continue;
      }
      // skip type script in same group
      const typeHash = cellMeta.cellOutput.type.hash();
      if (typeGroup.has(typeHash)) {
        continue;
      }
      typeGroup.add(typeHash);

      const argsTypePath = `--tx-file - --cell-type input  --script-group-type type --cell-index ${i}`;
      const argsType = this.args.slice().concat(argsTypePath.split(" "));
      const result2 = spawnSync(this.debugger, argsType, config);
      result.push(new ScriptVerificationResult("type", "input", i, result2));
    }
    for (const [i, e] of this.tx.outputs.entries()) {
      if (!e.type) {
        continue;
      }
      // skip type script in same group
      const typeHash = e.type.hash();
      if (typeGroup.has(typeHash)) {
        continue;
      }
      typeGroup.add(typeHash);
      const argsTypePath = `--tx-file - --cell-type output --script-group-type type --cell-index ${i}`;
      const argsType = this.args.slice().concat(argsTypePath.split(" "));
      const result1 = spawnSync(this.debugger, argsType, config);
      result.push(new ScriptVerificationResult("type", "output", i, result1));
    }
    return result;
  }
}
