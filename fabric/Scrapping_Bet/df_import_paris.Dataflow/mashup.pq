[StagingDefinition = [Kind = "FastCopy"]]
section Section1;
[DataDestinations = {[Definition = [Kind = "Reference", QueryName = "MonSuiviPariSportif xlsx_DataDestination", IsNewTarget = false], Settings = [Kind = "Manual", AllowCreation = false, ColumnSettings = [Mappings = {[SourceColumnName = "date_pari", DestinationColumnName = "date_pari"], [SourceColumnName = "id_bookmaker", DestinationColumnName = "id_bookmaker"], [SourceColumnName = "id_sport", DestinationColumnName = "id_sport"], [SourceColumnName = "libelle_competition", DestinationColumnName = "libelle_competition"], [SourceColumnName = "libelle_evenement", DestinationColumnName = "libelle_evenement"], [SourceColumnName = "id_type_pari", DestinationColumnName = "id_type_pari"], [SourceColumnName = "cote_bookmaker", DestinationColumnName = "cote_bookmaker"], [SourceColumnName = "mise_engagee", DestinationColumnName = "mise_engagee"], [SourceColumnName = "id_resultat", DestinationColumnName = "id_resultat"], [SourceColumnName = "id_pari_externe", DestinationColumnName = "id_pari_externe"]}], DynamicSchema = false, UpdateMethod = [Kind = "Replace"], TypeSettings = [Kind = "Table"]]]}]
shared #"MonSuiviPariSportif xlsx" = let
  Source = Lakehouse.Contents(null),
  Navigation = Source{[workspaceId = "41d4b6d3-34d9-41d3-a051-9f91192cc26a"]}[Data],
  #"Navigation 1" = Navigation{[lakehouseId = "607907de-4593-464b-b03c-caecbdb81615"]}[Data],
  #"Navigation 2" = #"Navigation 1"{[Id = "Files", ItemKind = "Folder"]}[Data],
  #"Navigation 3" = #"Navigation 2"{[Name = "import"]}[Content],
  #"Navigation 4" = #"Navigation 3"{[Name = "MonSuiviPariSportif.xlsx"]}[Content],
  #"Classeur Excel importé" = Excel.Workbook(#"Navigation 4", null, true),

  // 1. Récupération de la feuille BDD
  #"Feuille BDD" = #"Classeur Excel importé"{[Item="BDD", Kind="Sheet"]}[Data],
  #"En-têtes promus" = Table.PromoteHeaders(#"Feuille BDD", [PromoteAllScalars=true]),

  // 2. Typage explicite des colonnes
  #"Types modifiés" = Table.TransformColumnTypes(#"En-têtes promus",{
      {"ID_Externe", Int64.Type},{"Date", type date}, {"Bookmaker", type text}, {"Sport", type text},
      {"Compétition", type text}, {"Événement", type text}, {"Type de pari", type text},
      {"Boost", type text}, {"Cote", type number}, {"Mise", type number},
      {"Résultat", type text}, {"Gain", type number}
  }),

  // 3. "Type de pari" toujours vide, "Gain" recalculé par SQL : on les supprime
  #"Colonnes supprimées" = Table.RemoveColumns(#"Types modifiés", {"Type de pari", "Gain"}),

  // 4. Dates manquantes (paris en cours sans date saisie) -> placeholder
  #"Dates corrigées" = Table.TransformColumns(#"Colonnes supprimées",
      {{"Date", each if _ = null then #date(1900,1,1) else _, type date}}),

  // ===== Connexion à ta base SQL Fabric pour lire les dimensions =====
  // A remplacer : Fabric portal -> ta base SQL -> Paramètres -> Chaînes de connexion
  SourceSQL = Sql.Database("zf3afmdpfp5elpdba6qczp3eny-2o3niqozgtjudicrt6irslgcni.database.fabric.microsoft.com", "scrapping-bet-4423190a-684f-4cf0-91bc-89fe9fabeb67"),
  DimBookmaker = SourceSQL{[Schema="dbo", Item="dim_bookmaker"]}[Data],
  DimSport     = SourceSQL{[Schema="dbo", Item="dim_sport"]}[Data],
  DimTypePari  = SourceSQL{[Schema="dbo", Item="dim_type_pari"]}[Data],
  DimResultat  = SourceSQL{[Schema="dbo", Item="dim_resultat"]}[Data],

  // 5. Bookmaker -> id_bookmaker
  #"Fusion Bookmaker" = Table.NestedJoin(#"Dates corrigées", {"Bookmaker"}, DimBookmaker, {"nom"}, "DimBookmaker", JoinKind.LeftOuter),
  #"id_bookmaker extrait" = Table.ExpandTableColumn(#"Fusion Bookmaker", "DimBookmaker", {"id_bookmaker"}, {"id_bookmaker"}),
  #"Bookmaker supprimé" = Table.RemoveColumns(#"id_bookmaker extrait", {"Bookmaker"}),

  // 6. Sport -> id_sport
  #"Fusion Sport" = Table.NestedJoin(#"Bookmaker supprimé", {"Sport"}, DimSport, {"nom"}, "DimSport", JoinKind.LeftOuter),
  #"id_sport extrait" = Table.ExpandTableColumn(#"Fusion Sport", "DimSport", {"id_sport"}, {"id_sport"}),
  #"Sport supprimé" = Table.RemoveColumns(#"id_sport extrait", {"Sport"}),

  // 7. Boost -> id_type_pari
  #"Fusion TypePari" = Table.NestedJoin(#"Sport supprimé", {"Boost"}, DimTypePari, {"libelle"}, "DimTypePari", JoinKind.LeftOuter),
  #"id_type_pari extrait" = Table.ExpandTableColumn(#"Fusion TypePari", "DimTypePari", {"id_type_pari"}, {"id_type_pari"}),
  #"Boost supprimé" = Table.RemoveColumns(#"id_type_pari extrait", {"Boost"}),

  // 8. Résultat -> id_resultat (jointure externe gauche : pas de résultat = NULL conservé)
  #"Fusion Resultat" = Table.NestedJoin(#"Boost supprimé", {"Résultat"}, DimResultat, {"libelle"}, "DimResultat", JoinKind.LeftOuter),
  #"id_resultat extrait" = Table.ExpandTableColumn(#"Fusion Resultat", "DimResultat", {"id_resultat"}, {"id_resultat"}),
  #"Résultat supprimé" = Table.RemoveColumns(#"id_resultat extrait", {"Résultat"}),

  // 9. Renommage final pour coller aux colonnes de dbo.stg_paris
  #"Colonnes renommées" = Table.RenameColumns(#"Résultat supprimé", {
      {"ID_Externe", "id_pari_externe"},{"Date", "date_pari"}, {"Compétition", "libelle_competition"},
      {"Événement", "libelle_evenement"}, {"Cote", "cote_bookmaker"}, {"Mise", "mise_engagee"}
  }),

  // 10. Sélection/ordre final - doit correspondre exactement aux colonnes de stg_paris
    #"Colonnes finales" = Table.SelectColumns(#"Colonnes renommées", {
        "id_pari_externe",
        "date_pari", "id_bookmaker", "id_sport", "libelle_competition",
        "libelle_evenement", "id_type_pari", "cote_bookmaker", "mise_engagee", "id_resultat"
    })
in
  #"Colonnes finales";
shared #"MonSuiviPariSportif xlsx_DataDestination" = let
  Pattern = FabricSql.Contents([CreateNavigationProperties = false, HierarchicalNavigation = true]),
  Navigation_1 = Pattern{[workspaceId = "41d4b6d3-34d9-41d3-a051-9f91192cc26a"]}[Data],
  Navigation_2 = Navigation_1{[sqlId = "4423190a-684f-4cf0-91bc-89fe9fabeb67"]}[Data],
  Navigation_3 = Navigation_2{[Schema = "dbo"]}[Data],
  TableNavigation = Navigation_3{[Name = "stg_paris"]}[Data]
in
  TableNavigation;
