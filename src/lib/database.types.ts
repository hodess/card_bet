export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  graphql_public: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      graphql: {
        Args: {
          extensions?: Json
          operationName?: string
          query?: string
          variables?: Json
        }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  public: {
    Tables: {
      auctions: {
        Row: {
          card_id: number
          current_bid: number
          current_bidder: string
          forced_bidder: string
          game_id: string
          id: string
          last_bid_at: string
          opened_at: string
          passed: string[]
          seq: number
          status: string
        }
        Insert: {
          card_id: number
          current_bid: number
          current_bidder: string
          forced_bidder: string
          game_id: string
          id?: string
          last_bid_at?: string
          opened_at?: string
          passed?: string[]
          seq: number
          status?: string
        }
        Update: {
          card_id?: number
          current_bid?: number
          current_bidder?: string
          forced_bidder?: string
          game_id?: string
          id?: string
          last_bid_at?: string
          opened_at?: string
          passed?: string[]
          seq?: number
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "auctions_card_id_fkey"
            columns: ["card_id"]
            isOneToOne: false
            referencedRelation: "cards"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "auctions_current_bidder_fkey"
            columns: ["current_bidder"]
            isOneToOne: false
            referencedRelation: "players"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "auctions_forced_bidder_fkey"
            columns: ["forced_bidder"]
            isOneToOne: false
            referencedRelation: "players"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "auctions_game_id_fkey"
            columns: ["game_id"]
            isOneToOne: false
            referencedRelation: "games"
            referencedColumns: ["id"]
          },
        ]
      }
      cards: {
        Row: {
          id: number
          name: string
          pack: string
          position: string
          rating: number
          retired: boolean
        }
        Insert: {
          id?: never
          name: string
          pack?: string
          position: string
          rating: number
          retired?: boolean
        }
        Update: {
          id?: never
          name?: string
          pack?: string
          position?: string
          rating?: number
          retired?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "cards_pack_fkey"
            columns: ["pack"]
            isOneToOne: false
            referencedRelation: "packs"
            referencedColumns: ["slug"]
          },
        ]
      }
      friendships: {
        Row: {
          addressee: string
          created_at: string
          requester: string
          status: string
        }
        Insert: {
          addressee: string
          created_at?: string
          requester: string
          status?: string
        }
        Update: {
          addressee?: string
          created_at?: string
          requester?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "friendships_addressee_fkey"
            columns: ["addressee"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "friendships_requester_fkey"
            columns: ["requester"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      game_cards: {
        Row: {
          card_id: number
          game_id: string
          seq: number
        }
        Insert: {
          card_id: number
          game_id: string
          seq: number
        }
        Update: {
          card_id?: number
          game_id?: string
          seq?: number
        }
        Relationships: [
          {
            foreignKeyName: "game_cards_card_id_fkey"
            columns: ["card_id"]
            isOneToOne: false
            referencedRelation: "cards"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "game_cards_game_id_fkey"
            columns: ["game_id"]
            isOneToOne: false
            referencedRelation: "games"
            referencedColumns: ["id"]
          },
        ]
      }
      games: {
        Row: {
          close_delay_seconds: number
          code: string
          created_at: string
          deck_size: number
          id: string
          max_auction_seconds: number
          max_players: number
          min_bid: number
          next_game_id: string | null
          pack: string
          start_bankroll: number
          status: string
          visibility: string
        }
        Insert: {
          close_delay_seconds?: number
          code: string
          created_at?: string
          deck_size?: number
          id?: string
          max_auction_seconds?: number
          max_players?: number
          min_bid?: number
          next_game_id?: string | null
          pack?: string
          start_bankroll?: number
          status?: string
          visibility?: string
        }
        Update: {
          close_delay_seconds?: number
          code?: string
          created_at?: string
          deck_size?: number
          id?: string
          max_auction_seconds?: number
          max_players?: number
          min_bid?: number
          next_game_id?: string | null
          pack?: string
          start_bankroll?: number
          status?: string
          visibility?: string
        }
        Relationships: [
          {
            foreignKeyName: "games_next_game_id_fkey"
            columns: ["next_game_id"]
            isOneToOne: false
            referencedRelation: "games"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "games_pack_fkey"
            columns: ["pack"]
            isOneToOne: false
            referencedRelation: "packs"
            referencedColumns: ["slug"]
          },
        ]
      }
      match_cards: {
        Row: {
          card_id: number
          card_name: string
          card_position: string
          card_rating: number
          match_id: string
          price_paid: number
          seat: number
        }
        Insert: {
          card_id: number
          card_name: string
          card_position: string
          card_rating: number
          match_id: string
          price_paid: number
          seat: number
        }
        Update: {
          card_id?: number
          card_name?: string
          card_position?: string
          card_rating?: number
          match_id?: string
          price_paid?: number
          seat?: number
        }
        Relationships: [
          {
            foreignKeyName: "match_cards_match_id_fkey"
            columns: ["match_id"]
            isOneToOne: false
            referencedRelation: "matches"
            referencedColumns: ["id"]
          },
        ]
      }
      match_players: {
        Row: {
          is_bot: boolean
          match_id: string
          money_left: number
          nickname: string
          profile_id: string | null
          result: string
          score: number
          seat: number
        }
        Insert: {
          is_bot?: boolean
          match_id: string
          money_left: number
          nickname: string
          profile_id?: string | null
          result: string
          score: number
          seat: number
        }
        Update: {
          is_bot?: boolean
          match_id?: string
          money_left?: number
          nickname?: string
          profile_id?: string | null
          result?: string
          score?: number
          seat?: number
        }
        Relationships: [
          {
            foreignKeyName: "match_players_match_id_fkey"
            columns: ["match_id"]
            isOneToOne: false
            referencedRelation: "matches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "match_players_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      matches: {
        Row: {
          deck_size: number
          finished_at: string
          game_id: string | null
          id: string
          private_pack: boolean
          start_bankroll: number
        }
        Insert: {
          deck_size: number
          finished_at?: string
          game_id?: string | null
          id?: string
          private_pack?: boolean
          start_bankroll: number
        }
        Update: {
          deck_size?: number
          finished_at?: string
          game_id?: string | null
          id?: string
          private_pack?: boolean
          start_bankroll?: number
        }
        Relationships: []
      }
      packs: {
        Row: {
          created_at: string
          deleted_at: string | null
          description: string
          emoji: string
          name: string
          owner_id: string | null
          positions: Json
          slug: string
          sort_order: number | null
          visibility: string
        }
        Insert: {
          created_at?: string
          deleted_at?: string | null
          description?: string
          emoji?: string
          name: string
          owner_id?: string | null
          positions?: Json
          slug: string
          sort_order?: number | null
          visibility?: string
        }
        Update: {
          created_at?: string
          deleted_at?: string | null
          description?: string
          emoji?: string
          name?: string
          owner_id?: string | null
          positions?: Json
          slug?: string
          sort_order?: number | null
          visibility?: string
        }
        Relationships: [
          {
            foreignKeyName: "packs_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      player_cards: {
        Row: {
          card_id: number
          game_id: string
          player_id: string
          price_paid: number
        }
        Insert: {
          card_id: number
          game_id: string
          player_id: string
          price_paid: number
        }
        Update: {
          card_id?: number
          game_id?: string
          player_id?: string
          price_paid?: number
        }
        Relationships: [
          {
            foreignKeyName: "player_cards_card_id_fkey"
            columns: ["card_id"]
            isOneToOne: false
            referencedRelation: "cards"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "player_cards_game_id_fkey"
            columns: ["game_id"]
            isOneToOne: false
            referencedRelation: "games"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "player_cards_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "players"
            referencedColumns: ["id"]
          },
        ]
      }
      players: {
        Row: {
          auth_uid: string
          bankroll: number
          game_id: string
          id: string
          is_bot: boolean
          nickname: string
          seat: number
        }
        Insert: {
          auth_uid: string
          bankroll: number
          game_id: string
          id?: string
          is_bot?: boolean
          nickname: string
          seat: number
        }
        Update: {
          auth_uid?: string
          bankroll?: number
          game_id?: string
          id?: string
          is_bot?: boolean
          nickname?: string
          seat?: number
        }
        Relationships: [
          {
            foreignKeyName: "players_game_id_fkey"
            columns: ["game_id"]
            isOneToOne: false
            referencedRelation: "games"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          created_at: string
          id: string
          username: string
        }
        Insert: {
          created_at?: string
          id: string
          username: string
        }
        Update: {
          created_at?: string
          id?: string
          username?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      accept_friend_request: {
        Args: { p_username: string }
        Returns: undefined
      }
      claim_username: { Args: { p_username: string }; Returns: undefined }
      close_auction: { Args: { g_id: string }; Returns: undefined }
      create_game: {
        Args: {
          nickname: string
          p_close_delay_seconds?: number
          p_deck_size?: number
          p_max_auction_seconds?: number
          p_max_players?: number
          p_min_bid?: number
          p_pack?: string
          p_start_bankroll?: number
          p_visibility?: string
        }
        Returns: Json
      }
      deck_count: { Args: { p_id: string }; Returns: number }
      delete_pack: { Args: { p_slug: string }; Returns: undefined }
      effective_nickname: {
        Args: { typed: string; uid: string }
        Returns: string
      }
      get_profile_stats: { Args: { p_username: string }; Returns: Json }
      get_server_time: { Args: never; Returns: string }
      has_challenger: { Args: { p_auction_id: string }; Returns: boolean }
      install_official_pack: {
        Args: { p: Json; p_slug: string; p_sort_order: number }
        Returns: undefined
      }
      is_player: { Args: { g_id: string }; Returns: boolean }
      join_game: {
        Args: { game_code: string; nickname: string; p_is_bot?: boolean }
        Returns: Json
      }
      join_game_by_id: {
        Args: { g_id: string; nickname: string }
        Returns: Json
      }
      kick_player: {
        Args: { g_id: string; p_player_id: string }
        Returns: undefined
      }
      list_packs: { Args: never; Returns: Json }
      list_public_games: { Args: never; Returns: Json }
      may_host_pack: { Args: { p_slug: string; uid: string }; Returns: boolean }
      open_next_auction: {
        Args: { g_id: string; p_grace?: boolean }
        Returns: undefined
      }
      pass_auction: { Args: { g_id: string }; Returns: undefined }
      place_bid: { Args: { amount: number; g_id: string }; Returns: undefined }
      profile_id_of: { Args: { p_username: string }; Returns: string }
      purge_retired_cards: { Args: never; Returns: undefined }
      rematch_game: { Args: { old_game_id: string }; Returns: Json }
      remove_friendship: { Args: { p_username: string }; Returns: undefined }
      replace_pack_cards: {
        Args: { p: Json; p_slug: string }
        Returns: undefined
      }
      save_pack: {
        Args: { p_payload: Json; p_slug: string; p_visibility?: string }
        Returns: Json
      }
      send_friend_request: { Args: { p_username: string }; Returns: undefined }
      set_pack_visibility: {
        Args: { p_slug: string; p_visibility: string }
        Returns: undefined
      }
      slugify: { Args: { p: string }; Returns: string }
      start_game: { Args: { g_id: string }; Returns: undefined }
      update_game_settings: {
        Args: {
          g_id: string
          p_close_delay_seconds?: number
          p_deck_size?: number
          p_max_auction_seconds?: number
          p_max_players?: number
          p_min_bid?: number
          p_pack?: string
          p_start_bankroll?: number
        }
        Returns: undefined
      }
      validate_pack_payload: { Args: { p: Json }; Returns: undefined }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {},
  },
} as const

