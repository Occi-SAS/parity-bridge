use std::process::Command;

fn main() {
    Command::new("solc")
        .arg("--bin")
        .arg("--abi")
        .arg("../truffle/test/solidity/TestToken.sol")
        .arg("-o")
        .arg("../compiled_contracts")
        .arg("--overwrite")
        .status()
        .expect("failed to spawn bridge process");

}
