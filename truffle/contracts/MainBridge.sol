pragma solidity ^0.4.17;


import "./Authorities.sol";
import "./Helpers.sol";
import "./IBridge.sol";
import "./IERC20.sol";
import "./Message.sol";


contract MainBridge is IBridge, Authorities {
    address public token;

    /// Number of authorities signatures required to withdraw the money.
    ///
    /// Must be lesser than number of authorities.
    uint256 public requiredSignatures;

    /// Used side transaction hashes.
    mapping (bytes32 => bool) public withdraws;

    /// Event created on money deposit.
    event Deposit (address recipient, uint256 value);

    /// Event created on money withdraw.
    event Withdraw (address recipient, uint256 value, bytes32 transactionHash);

    /// Constructor.
    function MainBridge(
        address tokenParam,
        uint256 requiredSignaturesParam,
        address[] authoritiesParam
    ) public Authorities(authoritiesParam)
    {
        require(requiredSignaturesParam != 0);
        require(requiredSignaturesParam <= authoritiesParam.length);
        token = tokenParam;
        requiredSignatures = requiredSignaturesParam;
    }

    /// Called by the bridge node processes on startup
    /// to determine early whether the address pointing to the main
    /// bridge contract is misconfigured.
    /// so we can provide a helpful error message instead of the very
    /// unhelpful errors encountered otherwise.
    function isMainBridgeContract() public pure returns (bool) {
        return true;
    }

    function deposit(address owner, uint256 tokens) external {
        require(msg.sender == token);
        Deposit(owner, tokens);
    }

    /// final step of a withdraw.
    /// checks that `requiredSignatures` `authorities` have signed of on the `message`.
    /// then transfers `value` to `recipient` (both extracted from `message`).
    /// see message library above for a breakdown of the `message` contents.
    /// `vs`, `rs`, `ss` are the components of the signatures.

    /// anyone can call this, provided they have the message and required signatures!
    /// only the `authorities` can create these signatures.
    /// `requiredSignatures` authorities can sign arbitrary `message`s
    /// transfering any ether `value` out of this contract to `recipient`.
    /// bridge users must trust a majority of `requiredSignatures` of the `authorities`.
    function withdraw(uint8[] vs, bytes32[] rs, bytes32[] ss, bytes message) public {
        require(message.length == 116);

        // check that at least `requiredSignatures` `authorities` have signed `message`
        require(Helpers.hasEnoughValidSignatures(message, vs, rs, ss, authorities, requiredSignatures));

        address recipient = Message.getRecipient(message);
        uint256 value = Message.getValue(message);
        bytes32 hash = Message.getTransactionHash(message);

        // The following two statements guard against reentry into this function.
        // Duplicated withdraw or reentry.
        require(!withdraws[hash]);
        // Order of operations below is critical to avoid TheDAO-like re-entry bug
        withdraws[hash] = true;

        // pay out recipient
        IERC20(token).transfer(recipient, value);

        Withdraw(recipient, value, hash);
    }
}
