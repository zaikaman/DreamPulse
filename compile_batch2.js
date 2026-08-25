import fs from 'fs';
import solc from 'solc';
const source = fs.readFileSync('contracts/BatchApprove.sol', 'utf8');
const input = {
  language: 'Solidity',
  sources: { 'BatchApprove.sol': { content: source } },
  settings: { outputSelection: { '*': { '*': ['abi', 'evm.bytecode'] } } }
};
const output = JSON.parse(solc.compile(JSON.stringify(input)));
fs.writeFileSync('compile_output.json', JSON.stringify(output, null, 2));
console.log('compiled', Object.keys(output.contracts['BatchApprove.sol']));
