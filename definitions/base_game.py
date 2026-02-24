"""
Standard Settlers of Catan rules — defined entirely as config objects.

To create a variant, copy this and modify. Or override specific fields.
"""

from engine.config import (
    GameConfig, ResourceType, TerrainType, BuildingType, PlacementRule,
    PortType, DevCardType, DevCardEffect, DiceConfig, DiceOutcomeHandler,
    TradeRules, TurnPhase, WinCondition, Achievement, BoardTemplate,
    SetupRules, RobberRules,
)


def load_base_game() -> GameConfig:
    """Load the standard Catan game configuration."""

    # ---------------------------------------------------------------
    # Resources
    # ---------------------------------------------------------------
    resource_types = {
        "clay": ResourceType(id="clay", name="Clay", terrain="hills"),
        "wood": ResourceType(id="wood", name="Wood", terrain="forest"),
        "rock": ResourceType(id="rock", name="Rock", terrain="mountains"),
        "wheat": ResourceType(id="wheat", name="Wheat", terrain="fields"),
        "sheep": ResourceType(id="sheep", name="Sheep", terrain="pasture"),
    }

    # ---------------------------------------------------------------
    # Terrains
    # ---------------------------------------------------------------
    terrain_types = {
        "hills": TerrainType(id="hills", name="Clay", produces="clay", color="#c0392b"),
        "forest": TerrainType(id="forest", name="Wood", produces="wood", color="#27ae60"),
        "mountains": TerrainType(id="mountains", name="Rock", produces="rock", color="#7f8c8d"),
        "fields": TerrainType(id="fields", name="Wheat", produces="wheat", color="#f1c40f"),
        "pasture": TerrainType(id="pasture", name="Sheep", produces="sheep", color="#2ecc71"),
        "desert": TerrainType(id="desert", name="Desert", produces=None, color="#f0e68c"),
    }

    # ---------------------------------------------------------------
    # Buildings
    # ---------------------------------------------------------------
    building_types = {
        "settlement": BuildingType(
            id="settlement",
            name="Settlement",
            cost={"clay": 1, "wood": 1, "wheat": 1, "sheep": 1},
            vp=1,
            max_per_player=5,
            placement=PlacementRule(
                location_type="intersection",
                must_be_empty=True,
                distance_rule=1,
                requires_connected_road=True,
            ),
            production_multiplier=1,
        ),
        "city": BuildingType(
            id="city",
            name="City",
            cost={"rock": 3, "wheat": 2},
            vp=2,
            max_per_player=4,
            placement=PlacementRule(
                location_type="intersection",
                upgrades_from="settlement",
            ),
            production_multiplier=2,
        ),
        "road": BuildingType(
            id="road",
            name="Road",
            cost={"clay": 1, "wood": 1},
            vp=0,
            max_per_player=15,
            placement=PlacementRule(
                location_type="edge",
                must_be_empty=True,
            ),
            counts_as_road=True,
        ),
        # Dev card as a purchasable "building" (cost only, no placement)
        "dev_card": BuildingType(
            id="dev_card",
            name="Development Card",
            cost={"rock": 1, "wheat": 1, "sheep": 1},
            vp=0,
            max_per_player=99,
            placement=PlacementRule(location_type="none"),
        ),
    }

    # ---------------------------------------------------------------
    # Ports
    # ---------------------------------------------------------------
    port_types = {
        "generic": PortType(id="generic", name="3:1 Port", resource=None, ratio=3),
        "clay_port": PortType(id="clay_port", name="Clay Port", resource="clay", ratio=2),
        "wood_port": PortType(id="wood_port", name="Wood Port", resource="wood", ratio=2),
        "rock_port": PortType(id="rock_port", name="Rock Port", resource="rock", ratio=2),
        "wheat_port": PortType(id="wheat_port", name="Wheat Port", resource="wheat", ratio=2),
        "sheep_port": PortType(id="sheep_port", name="Sheep Port", resource="sheep", ratio=2),
    }

    # ---------------------------------------------------------------
    # Development cards
    # ---------------------------------------------------------------
    dev_card_types = {
        "knight": DevCardType(
            id="knight",
            name="Knight",
            count_in_deck=14,
            effects=[DevCardEffect(type="activate_robber")],
            persistent=True,
            persistent_tag="knight",
        ),
        "road_building": DevCardType(
            id="road_building",
            name="Road Building",
            count_in_deck=2,
            effects=[DevCardEffect(type="build_roads", params={"count": 2})],
        ),
        "year_of_plenty": DevCardType(
            id="year_of_plenty",
            name="Year of Plenty",
            count_in_deck=2,
            effects=[DevCardEffect(type="gain_resources", params={"count": 2})],
        ),
        "monopoly": DevCardType(
            id="monopoly",
            name="Monopoly",
            count_in_deck=2,
            effects=[DevCardEffect(type="monopoly")],
        ),
        "victory_point": DevCardType(
            id="victory_point",
            name="Victory Point",
            count_in_deck=5,
            is_victory_point=True,
            playable=False,
        ),
    }

    # ---------------------------------------------------------------
    # Dice
    # ---------------------------------------------------------------
    dice = DiceConfig(num_dice=2, sides_per_die=6)

    # What happens on each roll total
    dice_outcomes = {
        7: [DiceOutcomeHandler(action="activate_robber")],
        # All other totals produce resources (handled by default in engine)
    }

    # ---------------------------------------------------------------
    # Trading
    # ---------------------------------------------------------------
    trade_rules = TradeRules(
        player_trading_enabled=True,
        bank_trading_enabled=True,
        default_bank_ratio=4,
        counter_offers=True,
    )

    # ---------------------------------------------------------------
    # Turn phases
    # ---------------------------------------------------------------
    turn_phases = [
        TurnPhase(
            id="pre_roll",
            name="Pre-Roll",
            allowed_actions=["roll_dice", "play_dev_card"],
            auto_advance_after="roll_dice",
        ),
        TurnPhase(
            id="main",
            name="Main Phase",
            allowed_actions=["build", "buy_dev_card", "play_dev_card",
                           "trade_bank", "trade_offer", "end_turn"],
        ),
    ]

    # ---------------------------------------------------------------
    # Win conditions
    # ---------------------------------------------------------------
    win_conditions = [
        WinCondition(type="vp_threshold", params={"threshold": 10}),
    ]

    # ---------------------------------------------------------------
    # Achievements
    # ---------------------------------------------------------------
    achievements = {
        "longest_road": Achievement(
            id="longest_road",
            name="Longest Road",
            vp=2,
            metric="road_length",
            min_value=5,
        ),
        "largest_army": Achievement(
            id="largest_army",
            name="Largest Army",
            vp=2,
            metric="knight_count",
            min_value=3,
        ),
    }

    # ---------------------------------------------------------------
    # Board template (standard 3-ring Catan board)
    # ---------------------------------------------------------------
    board_template = BoardTemplate(
        num_rings=3,
        terrain_counts={
            "hills": 3,
            "forest": 4,
            "mountains": 3,
            "fields": 4,
            "pasture": 4,
            "desert": 1,
        },
        number_tokens=[2, 3, 3, 4, 4, 5, 5, 6, 6, 8, 8, 9, 9, 10, 10, 11, 11, 12],
        port_counts={
            "generic": 4,
            "clay_port": 1,
            "wood_port": 1,
            "rock_port": 1,
            "wheat_port": 1,
            "sheep_port": 1,
        },
    )

    # ---------------------------------------------------------------
    # Setup rules
    # ---------------------------------------------------------------
    setup_rules = SetupRules(
        min_players=2,  # Allow 2 for testing, standard is 3
        max_players=4,
        initial_placements=2,
        placement_order="forward_reverse",
        last_placement_gives_resources=True,
    )

    # ---------------------------------------------------------------
    # Robber
    # ---------------------------------------------------------------
    robber = RobberRules(
        enabled=True,
        discard_threshold=7,
        discard_fraction=0.5,
        steal_on_place=True,
        steal_count=1,
        must_move=True,
    )

    return GameConfig(
        name="Standard Catan",
        resource_types=resource_types,
        terrain_types=terrain_types,
        building_types=building_types,
        port_types=port_types,
        dev_card_types=dev_card_types,
        dice=dice,
        dice_outcomes=dice_outcomes,
        trade_rules=trade_rules,
        turn_phases=turn_phases,
        win_conditions=win_conditions,
        achievements=achievements,
        board_template=board_template,
        setup_rules=setup_rules,
        robber=robber,
    )
